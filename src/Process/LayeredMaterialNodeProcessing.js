import { chooseNextLevelToFetch } from '../Core/Layer/LayerUpdateStrategy';
import LayerUpdateState from '../Core/Layer/LayerUpdateState';
import { ImageryLayers } from '../Core/Layer/Layer';
import CancelledCommandException from '../Core/Scheduler/CancelledCommandException';
import { SIZE_TEXTURE_TILE } from '../Provider/OGCWebServiceHelper';
import { computeMinMaxElevation } from '../Parser/XbilParser';

// max retry loading before changing the status to definitiveError
const MAX_RETRY = 4;

function initNodeImageryTexturesFromParent(node, parent, layer) {
    const parentLayer = parent.material && parent.material.getLayer(layer.id);
    const nodeLayer = node.material && node.material.getLayer(layer.id);
    if (parentLayer && nodeLayer && parentLayer.level > nodeLayer.level) {
        const coords = node.getCoordsForLayer(layer);
        let index = 0;
        for (const c of coords) {
            for (const texture of parentLayer.textures) {
                if (c.isInside(texture.coords)) {
                    nodeLayer.setTexture(index, texture, c.offsetToParent(texture.coords));
                    break;
                }
            }
            index++;
        }
        node.material.updateUniforms();
    }
}

function initNodeElevationTextureFromParent(node, parent, layer) {
    // Inherit parent's elevation texture. Note that contrary to color layers the elevation level of the
    // node might not be EMPTY_TEXTURE_ZOOM in this init function. That's because we can have
    // multiple elevation layers (thus multiple calls to initNodeElevationTextureFromParent) but a given
    // node can only use 1 elevation texture
    const parentLayer = parent.material && parent.material.getElevationLayer();
    const nodeLayer = node.material && node.material.getElevationLayer();
    if (parentLayer && nodeLayer && parentLayer.level > nodeLayer.level) {
        const coords = node.getCoordsForLayer(layer);

        const texture = parentLayer.textures[0];
        const pitch = coords[0].offsetToParent(texture.coords);
        const elevation = {
            texture,
            pitch,
        };

        // If the texture resolution has a poor precision for this node, we don't
        // extract min-max from the texture (too few information), we instead chose
        // to use parent's min-max.
        const useMinMaxFromParent = node.level - texture.coords.zoom > 6;
        if (!useMinMaxFromParent) {
            const { min, max } = computeMinMaxElevation(
                texture.image.data,
                SIZE_TEXTURE_TILE, SIZE_TEXTURE_TILE,
                pitch);
            elevation.min = min;
            elevation.max = max;
        }

        node.setBBoxZ(elevation.min, elevation.max);
        node.material.getElevationLayer().setTexture(0, elevation.texture, elevation.pitch);
        node.material.updateUniforms();
    }
}

function getIndiceWithPitch(i, pitch, w) {
    // Return corresponding indice in parent tile using pitch
    const currentX = (i % w) / w;  // normalized
    const currentY = Math.floor(i / w) / w; // normalized
    const newX = pitch.x + currentX * pitch.z;
    const newY = pitch.y + currentY * pitch.w;
    const newIndice = Math.floor(newY * w) * w + Math.floor(newX * w);
    return newIndice;
}

function insertSignificantValuesFromParent(texture, node, parent, layer) {
    const nodeParent = parent.material && parent.material.getElevationLayer();
    const textureParent = nodeParent && nodeParent.textures[0];
    if (textureParent) {
        const coords = node.getCoordsForLayer(layer);
        const pitch = coords[0].offsetToParent(textureParent.coords);
        const tData = texture.image.data;
        const l = tData.length;

        for (var i = 0; i < l; ++i) {
            if (tData[i] === layer.noDataValue) {
                tData[i] = textureParent.image.data[getIndiceWithPitch(i, pitch, 256)];
            }
        }
    }
}

function nodeCommandQueuePriorityFunction(node) {
    // We know that 'node' is visible because commands can only be
    // issued for visible nodes.

    // TODO: need priorization of displayed nodes
    if (node.isDisplayed()) {
        // Then prefer displayed() node over non-displayed one
        return 100;
    } else {
        return 10;
    }
}

function refinementCommandCancellationFn(cmd) {
    if (!cmd.requester.parent || !cmd.requester.material) {
        return true;
    }
    if (cmd.force) {
        return false;
    }

    // Cancel the command if the tile already has a better texture.
    // This is only needed for elevation layers, because we may have several
    // concurrent layers but we can only use one texture.
    if (cmd.layer.type == 'elevation' &&
        cmd.targetLevel <= cmd.requester.material.getElevationLayer().level) {
        return true;
    }

    return !cmd.requester.isDisplayed();
}

function checkNodeElevationTextureValidity(texture, noDataValue) {
    // We check if the elevation texture has some significant values through corners
    const tData = texture.image.data;
    const l = tData.length;
    return tData[0] > noDataValue &&
           tData[l - 1] > noDataValue &&
           tData[Math.sqrt(l) - 1] > noDataValue &&
           tData[l - Math.sqrt(l)] > noDataValue;
}

export function updateLayeredMaterialNodeImagery(context, layer, node) {
    if (!node.parent) {
        return;
    }

    const material = node.material;
    let nodeLayer = material.getLayer(layer.id);

    // Initialisation
    if (node.layerUpdateState[layer.id] === undefined) {
        node.layerUpdateState[layer.id] = new LayerUpdateState();

        if (!layer.tileInsideLimit(node, layer)) {
            // we also need to check that tile's parent doesn't have a texture for this layer,
            // because even if this tile is outside of the layer, it could inherit it's
            // parent texture
            if (!layer.noTextureParentOutsideLimit &&
                node.parent &&
                node.parent.material &&
                node.parent.material.getLayer &&
                node.parent.material.getLayer(layer.id)) {
                // ok, we're going to inherit our parent's texture
            } else {
                node.layerUpdateState[layer.id].noMoreUpdatePossible();
                return;
            }
        }

        if (!nodeLayer) {
            const colorLayer = {
                tileMT: layer.options.tileMatrixSet || node.getCoordsForLayer(layer)[0].crs(),
                texturesCount: node.getCoordsForLayer(layer).length,
                visible: layer.visible,
                opacity: layer.opacity,
                effect: layer.fx,
                id: layer.id,
            };

            nodeLayer = material.addLayer(colorLayer);
            const colorLayers = context.view.getLayers(l => l.type === 'color');
            const sequence = ImageryLayers.getColorLayersIdOrderedBySequence(colorLayers);
            material.setSequence(sequence);
            initNodeImageryTexturesFromParent(node, node.parent, layer);
        }

        // Proposed new process, two separate processes:
        //      * FIRST PASS: initNodeXXXFromParent and get out of the function
        //      * SECOND PASS: Fetch best texture

        // The two-step allows you to filter out unnecessary requests
        // Indeed in the second pass, their state (not visible or not displayed) can block them to fetch
        const minLevel = layer.options.zoom ? layer.options.zoom.min : 0;
        if (nodeLayer.level >= minLevel) {
            context.view.notifyChange(false, node);
            return;
        }
    }

    // Node is hidden, no need to update it
    if (!node.isDisplayed()) {
        return;
    }

    // TODO: move this to defineLayerProperty() declaration
    // to avoid mixing layer's network updates and layer's params
    // Update material parameters
    if (nodeLayer) {
        nodeLayer.visible = layer.visible;
        nodeLayer.opacity = layer.opacity;
        material.updateUniforms();
    }

    const ts = Date.now();
    // An update is pending / or impossible -> abort
    if (!layer.visible || !node.layerUpdateState[layer.id].canTryUpdate(ts)) {
        return;
    }


    // does this tile needs a new texture?
    if (layer.canTileTextureBeImproved) {
        // if the layer has a custom method -> use it
        if (!layer.canTileTextureBeImproved(layer, node)) {
            node.layerUpdateState[layer.id].noMoreUpdatePossible();
            return;
        }
    } else if (nodeLayer.level >= node.getZoomForLayer(layer)) {
        // default decision method
        node.layerUpdateState[layer.id].noMoreUpdatePossible();
        return;
    }

    // is fetching data from this layer disabled?
    if (layer.frozen) {
        return;
    }

    const failureParams = node.layerUpdateState[layer.id].failureParams;
    const nodeLevel = node.getCoordsForLayer(layer)[0].zoom || node.level;
    const targetLevel = chooseNextLevelToFetch(layer.updateStrategy.type, node, nodeLevel, nodeLayer.level, layer, failureParams);
    if (targetLevel <= nodeLayer.level) {
        return;
    }

    // Retry tileInsideLimit because you must check with the targetLevel
    // if the first test layer.tileInsideLimit returns that it is out of limits
    // and the node inherits from its parent, then it'll still make a command to fetch texture.
    if (!layer.tileInsideLimit(node, layer, targetLevel)) {
        node.layerUpdateState[layer.id].noMoreUpdatePossible();
        return;
    }

    node.layerUpdateState[layer.id].newTry();
    const command = {
        /* mandatory */
        view: context.view,
        layer,
        requester: node,
        priority: nodeCommandQueuePriorityFunction(node),
        earlyDropFunction: refinementCommandCancellationFn,
        targetLevel,
    };

    return context.scheduler.execute(command).then(
        (result) => {
            if (node.material === null) {
                return;
            }
            if (Array.isArray(result)) {
                nodeLayer.setTextures(result);
            } else if (result.texture) {
                nodeLayer.setTextures([result]);
            } else {
                // TODO: null texture is probably an error
                // Maybe add an error counter for the node/layer,
                // and stop retrying after X attempts.
            }
            node.material.updateUniforms();

            node.layerUpdateState[layer.id].success();

            return result;
        },
        (err) => {
            if (err instanceof CancelledCommandException) {
                node.layerUpdateState[layer.id].success();
            } else {
                if (__DEBUG__) {
                    console.warn('Imagery texture update error for', node, err);
                }
                const definitiveError = node.layerUpdateState[layer.id].errorCount > MAX_RETRY;
                node.layerUpdateState[layer.id].failure(Date.now(), definitiveError, { targetLevel });
                if (!definitiveError) {
                    window.setTimeout(() => {
                        context.view.notifyChange(false, node);
                    }, node.layerUpdateState[layer.id].secondsUntilNextTry() * 1000);
                }
            }
        });
}

export function updateLayeredMaterialNodeElevation(context, layer, node) {
    const nodeLayer = node.material && node.material.getElevationLayer();
    if (!node.parent || !layer) {
        return;
    }
    // TODO: we need either
    //  - compound or exclusive layers
    //  - support for multiple elevation layers

    // Elevation is currently handled differently from color layers.
    // This is caused by a LayeredMaterial limitation: only 1 elevation texture
    // can be used (where a tile can have N textures x M layers)
    let currentElevation = nodeLayer.level;

    // Init elevation layer, and inherit from parent if possible
    if (node.layerUpdateState[layer.id] === undefined) {
        node.layerUpdateState[layer.id] = new LayerUpdateState();
        initNodeElevationTextureFromParent(node, node.parent, layer);
        currentElevation = nodeLayer.level;
        const minLevel = layer.options.zoom ? layer.options.zoom.min : 0;
        if (currentElevation >= minLevel) {
            context.view.notifyChange(false, node);
            return;
        }
    }

    // Try to update
    const ts = Date.now();

    // Possible conditions to *not* update the elevation texture
    if (layer.frozen ||
            !node.isDisplayed() ||
            !node.layerUpdateState[layer.id].canTryUpdate(ts)) {
        return;
    }

    // Does this tile needs a new texture?
    if (layer.canTileTextureBeImproved) {
        // if the layer has a custom method -> use it
        if (!layer.canTileTextureBeImproved(layer, node)) {
            node.layerUpdateState[layer.id].noMoreUpdatePossible();
            return;
        }
    }

    const c = node.getCoordsForLayer(layer)[0];
    const zoom = c.zoom || node.level;
    const targetLevel = chooseNextLevelToFetch(layer.updateStrategy.type, node, zoom, currentElevation, layer);

    if (targetLevel <= currentElevation || !layer.tileInsideLimit(node, layer, targetLevel)) {
        node.layerUpdateState[layer.id].noMoreUpdatePossible();
        return Promise.resolve();
    }

    node.layerUpdateState[layer.id].newTry();

    const command = {
        /* mandatory */
        view: context.view,
        layer,
        requester: node,
        targetLevel,
        priority: nodeCommandQueuePriorityFunction(node),
        earlyDropFunction: refinementCommandCancellationFn,
    };

    return context.scheduler.execute(command).then(
        (elevation) => {
            const nodeLayer = node.material && node.material.getElevationLayer();
            if (!nodeLayer) {
                return;
            }

            // Do not apply the new texture if its level is < than the current one.
            // This is only needed for elevation layers, because we may have several
            // concurrent layers but we can only use one texture.
            if (targetLevel <= nodeLayer.level) {
                node.layerUpdateState[layer.id].noMoreUpdatePossible();
                return;
            }

            node.layerUpdateState[layer.id].success();

            if (elevation.texture && elevation.texture.flipY) {
                // DataTexture default to false, so make sure other Texture types
                // do the same (eg image texture)
                // See UV construction for more details
                elevation.texture.flipY = false;
                elevation.texture.needsUpdate = true;
            }

            if (elevation.texture && elevation.texture.image.data && !checkNodeElevationTextureValidity(elevation.texture, layer.noDataValue)) {
                // Quick check to avoid using elevation texture with no data value
                // If we have no data values, we use value from the parent tile
                // We should later implement multi elevation layer to choose the one to use at each level
                insertSignificantValuesFromParent(elevation.texture, node, node.parent, layer);
            }

            node.setBBoxZ(elevation.min, elevation.max);
            node.material.getElevationLayer().setTexture(0, elevation.texture, elevation.pitch);
            node.material.updateUniforms();
        },
        (err) => {
            if (err instanceof CancelledCommandException) {
                node.layerUpdateState[layer.id].success();
            } else {
                if (__DEBUG__) {
                    console.warn('Elevation texture update error for', node, err);
                }
                const definitiveError = node.layerUpdateState[layer.id].errorCount > MAX_RETRY;
                node.layerUpdateState[layer.id].failure(Date.now(), definitiveError);
                if (!definitiveError) {
                    window.setTimeout(() => {
                        context.view.notifyChange(false, node);
                    }, node.layerUpdateState[layer.id].secondsUntilNextTry() * 1000);
                }
            }
        });
}
