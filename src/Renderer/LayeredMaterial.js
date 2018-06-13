/*
 * To change this license header, choose License Headers in Project Properties.
 * To change this template file, choose Tools | Templates
 * and open the template in the editor.
 */


import * as THREE from 'three';
import TileVS from './Shader/TileVS.glsl';
import TileFS from './Shader/TileFS.glsl';
import ShaderUtils from './Shader/ShaderUtils';
import Capabilities from '../Core/System/Capabilities';
import { l_COLOR, l_ELEVATION, EMPTY_TEXTURE_ZOOM } from './LayeredMaterialConstants';
import precision_qualifier from './Shader/Chunk/PrecisionQualifier.glsl';
import project_pars_vertex from './Shader/Chunk/project_pars_vertex.glsl';
import elevation_pars_vertex from './Shader/Chunk/elevation_pars_vertex.glsl';
import elevation_vertex from './Shader/Chunk/elevation_vertex.glsl';
import pitUV from './Shader/Chunk/pitUV.glsl';

THREE.ShaderChunk['itowns.precision_qualifier'] = precision_qualifier;
THREE.ShaderChunk['itowns.project_pars_vertex'] = project_pars_vertex;
THREE.ShaderChunk['itowns.elevation_pars_vertex'] = elevation_pars_vertex;
THREE.ShaderChunk['itowns.elevation_vertex'] = elevation_vertex;
THREE.ShaderChunk['itowns.pitUV'] = pitUV;

var emptyTexture = new THREE.Texture();
emptyTexture.coords = { zoom: EMPTY_TEXTURE_ZOOM };

const layerTypesCount = 2;
var vector4 = new THREE.Vector4(0.0, 0.0, 0.0, 0.0);

// from three.js packDepthToRGBA
const UnpackDownscale = 255 / 256; // 0..1 -> fraction (excluding 1)
export function unpack1K(color, factor) {
    var bitSh = new THREE.Vector4(
        UnpackDownscale / (256.0 * 256.0 * 256.0),
        UnpackDownscale / (256.0 * 256.0),
        UnpackDownscale / 256.0,
        UnpackDownscale);
    return factor ? bitSh.dot(color) * factor : bitSh.dot(color);
}

// Array not suported in IE
var fillArray = function fillArray(array, remp) {
    for (var i = 0; i < array.length; i++)
        { array[i] = remp; }
};

var moveElementArray = function moveElementArray(array, oldIndex, newIndex)
{
    array.splice(newIndex, 0, array.splice(oldIndex, 1)[0]);
};

/* eslint-disable */
var moveElementsArraySafe = function moveElementsArraySafe(array,index, howMany, toIndex) {
    index = parseInt(index) || 0;
    index = index < 0 ? array.length + index : index;
    toIndex = parseInt(toIndex) || 0;
    toIndex = toIndex < 0 ? array.length + toIndex : toIndex;
    if((toIndex > index) && (toIndex <= index + howMany)) {
        toIndex = index + howMany;
    }

    var moved;
    array.splice.apply(array, [toIndex, 0].concat(moved = array.splice(index, howMany)));
    return moved;
};
/* eslint-enable */

const LayeredMaterial = function LayeredMaterial(options = {}) {
    THREE.RawShaderMaterial.call(this);
    this.defines = {};

    const maxTexturesUnits = Capabilities.getMaxTextureUnitsCount();
    const nbSamplers = Math.min(maxTexturesUnits - 1, 16 - 1);

    this.defines.NUM_TEXTURES = nbSamplers;
    this.defines.NUM_LAYERS = 8;

    if (__DEBUG__) {
        this.defines.DEBUG = 1;
        this.showOutline = false;
        this.uniforms.showOutline = new THREE.Uniform(this.showOutline);
    }

    if (options.useRgbaTextureElevation) {
        throw new Error('Restore this feature');
    } else if (options.useColorTextureElevation) {
        this.defines.COLOR_TEXTURE_ELEVATION = 1;
        this.defines._minElevation = options.colorTextureElevationMinZ.toFixed(1);
        this.defines._maxElevation = options.colorTextureElevationMaxZ.toFixed(1);
    } else {
        this.defines.DATA_TEXTURE_ELEVATION = 1;
    }

    this.vertexShader = TileVS;
    this.fragmentShader = ShaderUtils.unrollLoops(TileFS, this.defines);

    this.lightPosition = new THREE.Vector3();
    this.noTextureColor = new THREE.Color();


    // handle on textures uniforms
    this.textures = [];
    // handle on textures offsetScale uniforms
    this.offsetScale = [];
    // handle Loaded textures count by layer's type uniforms
    this.loadedTexturesCount = [0, 0];

    // Uniform three js needs no empty array
    // WARNING TODO: prevent empty slot, but it's not the solution
    this.offsetScale[l_COLOR] = Array(nbSamplers);
    this.offsetScale[l_ELEVATION] = [vector4];
    fillArray(this.offsetScale[l_COLOR], vector4);

    this.textures[l_ELEVATION] = [emptyTexture];
    this.textures[l_COLOR] = Array(nbSamplers);
    this.paramLayers = Array(8);
    this.layerTexturesCount = Array(8);

    fillArray(this.textures[l_COLOR], emptyTexture);
    fillArray(this.paramLayers, {});
    fillArray(this.layerTexturesCount, 0);


    this.noTextureColor = new THREE.Color(0.04, 0.23, 0.35);
    this.lightPosition = new THREE.Vector3(-0.5, 0.0, 1.0);
    this.distanceFog = 1000000000.0;
    this.selected = false;
    this.lightingEnabled = false;
    this.uuid = 0;

    // Elevation texture
    this.uniforms.dTextures_00 = new THREE.Uniform(this.textures[l_ELEVATION]);

    // Color textures's layer
    this.uniforms.dTextures_01 = new THREE.Uniform(this.textures[l_COLOR]);

    // Loaded textures count by layer's type
    this.uniforms.elevationTextureCount = new THREE.Uniform(0);
    this.uniforms.colorTextureCount = new THREE.Uniform(0);

    // Count color layers
    this.uniforms.colorLayersCount = new THREE.Uniform(1);

    this.uniforms.paramLayers = new THREE.Uniform(this.paramLayers);

    // Elevation texture cropping
    this.uniforms.offsetScale_L00 = new THREE.Uniform(this.offsetScale[l_ELEVATION]);

    // Color texture cropping
    this.uniforms.offsetScale_L01 = new THREE.Uniform(this.offsetScale[l_COLOR]);

    this.uniforms.lightPosition = new THREE.Uniform(this.lightPosition);
    this.uniforms.distanceFog = new THREE.Uniform(this.distanceFog);
    this.uniforms.uuid = new THREE.Uniform(this.uuid);
    this.uniforms.selected = new THREE.Uniform(this.selected);
    this.uniforms.lightingEnabled = new THREE.Uniform(this.lightingEnabled);
    this.uniforms.noTextureColor = new THREE.Uniform(this.noTextureColor);
    this.uniforms.opacity = new THREE.Uniform(this.opacity);

    this.colorLayersId = [];
    this.elevationLayersId = [];

    if (Capabilities.isLogDepthBufferSupported()) {
        this.defines.USE_LOGDEPTHBUF = 1;
        this.defines.USE_LOGDEPTHBUF_EXT = 1;
    }

    if (__DEBUG__) {
        this.checkLayersConsistency = function checkLayersConsistency(node, imageryLayers) {
            for (const layer of imageryLayers) {
                const index = this.indexOfColorLayer(layer.id);
                if (index < 0) {
                    continue;
                }

                const offset = this.getTextureOffsetByLayerIndex(index);
                const count = this.getTextureCountByLayerIndex(index);
                let total = 0;
                for (let i = 0; i < this.loadedTexturesCount[1]; i++) {
                    if (!this.uniforms.dTextures_01.value[i].image) {
                        throw new Error(`${node.id} - Missing texture at index ${i} for layer ${layer.id}`);
                    }

                    const critere1 = (offset <= i && i < (offset + count));
                    const search = layer.name ? `LAYERS=${layer.name}&` : `LAYER=${layer.options.name}&`;
                    const critere2 = this.uniforms.dTextures_01.value[i].image.currentSrc.indexOf(search) > 0;

                    if (critere1 && !critere2) {
                        throw new Error(`${node.id} - Texture should belong to ${layer.id} but comes from ${this.uniforms.dTextures_01.value[i].image.currentSrc}`);
                    } else if (!critere1 && critere2) {
                        throw new Error(`${node.id} - Texture shouldn't belong to ${layer.id}`);
                    } else if (critere1) {
                        total++;
                    }
                }
                if (total != count) {
                    throw new Error(`${node.id} - Invalid total texture count. Found: ${total}, expected: ${count} for ${layer.id}`);
                }
            }
        };
    }
};


LayeredMaterial.prototype = Object.create(THREE.RawShaderMaterial.prototype);
LayeredMaterial.prototype.constructor = LayeredMaterial;

LayeredMaterial.prototype.updateUniforms = function updateUniforms() {
    this.uniforms.opacity.value = this.opacity;
    this.uniforms.showOutline.value = this.showOutline;
    this.uniforms.lightingEnabled.value = this.lightingEnabled;
    this.uniforms.selected.value = this.selected;
    this.uniforms.uuid.value = this.uuid;
    this.uniforms.distanceFog.value = this.distanceFog;
    this.uniforms.noTextureColor.value.copy(this.noTextureColor);
    this.uniforms.lightPosition.value.copy(this.lightPosition);
    this.uniforms.elevationTextureCount.value = this.textures[l_ELEVATION][0] === emptyTexture ? 0 : 1;
    // this.uniforms.colorTextureCount.value = ???;
    this.uniforms.colorLayersCount.value = this.colorLayersId.length;
    this.uniformsNeedUpdate = true;
};

LayeredMaterial.prototype.dispose = function dispose() {
    // TODO: WARNING  verify if textures to dispose aren't attached with ancestor

    this.dispatchEvent({
        type: 'dispose',
    });

    for (let l = 0; l < layerTypesCount; l++) {
        for (let i = 0, max = this.textures[l].length; i < max; i++) {
            if (this.textures[l][i] instanceof THREE.Texture) {
                this.textures[l][i].dispose();
            }
        }
    }
};

LayeredMaterial.prototype.setSequence = function setSequence(sequenceLayer) {
    let offsetLayer = 0;
    let offsetTexture = 0;

    const originalOffsets = new Array(...this.uniforms.offsetScale_L01.value);
    const originalTextures = new Array(...this.uniforms.dTextures_01.value);

    for (let l = 0; l < sequenceLayer.length; l++) {
        const layer = sequenceLayer[l];
        const oldIndex = this.indexOfColorLayer(layer);
        if (oldIndex > -1) {
            const newIndex = l - offsetLayer;
            const texturesCount = this.layerTexturesCount[oldIndex];

            // individual values are swapped in place
            if (newIndex !== oldIndex) {
                moveElementArray(this.colorLayersId, oldIndex, newIndex);
                moveElementArray(this.layerTexturesCount, oldIndex, newIndex);
                moveElementArray(this.uniforms.paramLayers.value, oldIndex, newIndex);
            }
            const oldOffset = this.getTextureOffsetByLayerIndex(newIndex);
            // consecutive values are copied from original
            for (let i = 0; i < texturesCount; i++) {
                this.uniforms.offsetScale_L01.value[offsetTexture + i] = originalOffsets[oldOffset + i];
                this.uniforms.dTextures_01.value[offsetTexture + i] = originalTextures[oldOffset + i];
            }


            this.setTextureOffsetByLayerIndex(newIndex, offsetTexture);
            offsetTexture += texturesCount;
        } else {
            offsetLayer++;
        }
    }
};

LayeredMaterial.prototype.removeColorLayer = function removeColorLayer(layer) {
    const layerIndex = this.indexOfColorLayer(layer);

    if (layerIndex === -1) {
        return;
    }

    const offset = this.getTextureOffsetByLayerIndex(layerIndex);
    const texturesCount = this.getTextureCountByLayerIndex(layerIndex);

    // remove layer
    this.colorLayersId.splice(layerIndex, 1);
    this.uniforms.colorLayersCount.value = this.getColorLayersCount();

    // remove nb textures
    this.layerTexturesCount.splice(layerIndex, 1);
    this.layerTexturesCount.push(0);

    // Remove Layers Parameters
    var param = this.uniforms.paramLayers.value.splice(layerIndex, 1)[0];
    param.visible = true;
    this.uniforms.paramLayers.value.push(param);


    // Dispose Layers textures
    for (let i = offset, max = offset + texturesCount; i < max; i++) {
        if (this.textures[l_COLOR][i] instanceof THREE.Texture) {
            this.textures[l_COLOR][i].dispose();
        }
    }

    const removedTexturesLayer = this.textures[l_COLOR].splice(offset, texturesCount);
    this.offsetScale[l_COLOR].splice(offset, texturesCount);

    const loadedTexturesLayerCount = removedTexturesLayer.reduce((sum, texture) => sum + (texture.coords.zoom > EMPTY_TEXTURE_ZOOM), 0);

    // refill remove textures
    for (let i = 0, max = texturesCount; i < max; i++) {
        this.textures[l_COLOR].push(emptyTexture);
        this.offsetScale[l_COLOR].push(vector4);
    }

    // Update slot start texture layer
    for (let j = layerIndex, mx = this.getColorLayersCount(); j < mx; j++) {
        this.uniforms.paramLayers.value[j].textureOffset -= texturesCount;
    }

    this.loadedTexturesCount[l_COLOR] -= loadedTexturesLayerCount;

    this.uniforms.offsetScale_L01.value = this.offsetScale[l_COLOR];
    this.uniforms.dTextures_01.value = this.textures[l_COLOR];
};

LayeredMaterial.prototype.setTexturesLayer = function setTexturesLayer(textures, layerType, layer) {
    const index = this.indexOfColorLayer(layer);
    const slotOffset = this.getTextureOffsetByLayerIndex(index);
    for (let i = 0, max = textures.length; i < max; i++) {
        if (textures[i]) {
            if (textures[i].texture !== null) {
                this.setTexture(textures[i].texture, layerType, i + (slotOffset || 0), textures[i].pitch);
            } else {
                this.setLayerVisibility(index, false);
                break;
            }
        }
    }
};

LayeredMaterial.prototype.setTexture = function setTexture(texture, layerType, slot, offsetScale) {
    if (this.textures[layerType][slot] === undefined || this.textures[layerType][slot].image === undefined) {
        this.loadedTexturesCount[layerType] += 1;
    }

    // BEWARE: array [] -> size: 0; array [10]="wao" -> size: 11
    this.textures[layerType][slot] = texture || emptyTexture;
    this.offsetScale[layerType][slot] = offsetScale || new THREE.Vector4(0.0, 0.0, 1.0, 1.0);
};

LayeredMaterial.prototype.setColorLayerParameters = function setColorLayerParameters(params) {
    if (this.getColorLayersCount() === 0) {
        for (let l = 0; l < params.length; l++) {
            this.pushLayer(params[l]);
        }
    }
};

LayeredMaterial.prototype.pushLayer = function pushLayer(param) {
    const newIndex = this.getColorLayersCount();
    const offset = newIndex === 0 ? 0 : this.getTextureOffsetByLayerIndex(newIndex - 1) + this.getTextureCountByLayerIndex(newIndex - 1);

    this.uniforms.paramLayers.value[newIndex] = {};

    this.setTextureOffsetByLayerIndex(newIndex, offset);
    // If there's only one texture: assume it covers the whole tile,
    // otherwise declare the number of textures
    this.setLayerUV(newIndex, (param.texturesCount == 1) ? 0 : param.texturesCount);
    this.setLayerFx(newIndex, param.fx);
    this.setLayerOpacity(newIndex, param.opacity);
    this.setLayerVisibility(newIndex, param.visible);
    this.setLayerTexturesCount(newIndex, param.texturesCount);
    this.colorLayersId.push(param.idLayer);

    this.uniforms.colorLayersCount.value = this.getColorLayersCount();
};

LayeredMaterial.prototype.indexOfColorLayer = function indexOfColorLayer(layerId) {
    return this.colorLayersId.indexOf(layerId);
};

LayeredMaterial.prototype.getColorLayersCount = function getColorLayersCount() {
    return this.colorLayersId.length;
};

LayeredMaterial.prototype.getTextureOffsetByLayerIndex = function getTextureOffsetByLayerIndex(index) {
    return this.uniforms.paramLayers.value[index].textureOffset;
};

LayeredMaterial.prototype.getTextureCountByLayerIndex = function getTextureCountByLayerIndex(index) {
    return this.layerTexturesCount[index];
};

LayeredMaterial.prototype.getLayerTextureOffset = function getLayerTextureOffset(layerId) {
    const index = this.indexOfColorLayer(layerId);
    return index > -1 ? this.getTextureOffsetByLayerIndex(index) : -1;
};

LayeredMaterial.prototype.setLayerFx = function setLayerFx(index, effect) {
    this.uniforms.paramLayers.value[index].effect = effect;
};

LayeredMaterial.prototype.setTextureOffsetByLayerIndex = function setTextureOffsetByLayerIndex(index, textureOffset) {
    this.uniforms.paramLayers.value[index].textureOffset = textureOffset;
};

LayeredMaterial.prototype.setLayerUV = function setLayerUV(index, textureCount) {
    this.uniforms.paramLayers.value[index].textureCount = textureCount;
};

LayeredMaterial.prototype.getLayerUV = function setLayerUV(index) {
    return this.uniforms.paramLayers.value[index].textureCount;
};

LayeredMaterial.prototype.setLayerOpacity = function setLayerOpacity(index, opacity) {
    if (this.uniforms.paramLayers.value[index]) this.uniforms.paramLayers.value[index].opacity = opacity;
};

LayeredMaterial.prototype.setLayerVisibility = function setLayerVisibility(index, visible) {
    if (this.uniforms.paramLayers.value[index]) this.uniforms.paramLayers.value[index].visible = visible;
};

LayeredMaterial.prototype.setLayerTexturesCount = function setLayerTexturesCount(index, count) {
    this.layerTexturesCount[index] = count;
};

LayeredMaterial.prototype.getLoadedTexturesCount = function getLoadedTexturesCount() {
    return this.loadedTexturesCount[l_ELEVATION] + this.loadedTexturesCount[l_COLOR];
};

LayeredMaterial.prototype.isColorLayerDownscaled = function isColorLayerDownscaled(layerId, zoom) {
    return this.textures[l_COLOR][this.getLayerTextureOffset(layerId)] &&
        this.textures[l_COLOR][this.getLayerTextureOffset(layerId)].coords.zoom < zoom;
};

LayeredMaterial.prototype.getColorLayerLevelById = function getColorLayerLevelById(colorLayerId) {
    const index = this.indexOfColorLayer(colorLayerId);
    if (index === -1) {
        return EMPTY_TEXTURE_ZOOM;
    }
    const slot = this.getTextureOffsetByLayerIndex(index);
    const texture = this.textures[l_COLOR][slot];

    return texture ? texture.coords.zoom : EMPTY_TEXTURE_ZOOM;
};

LayeredMaterial.prototype.getElevationLayerLevel = function getElevationLayerLevel() {
    return this.textures[l_ELEVATION][0].coords.zoom;
};

LayeredMaterial.prototype.getLayerTextures = function getLayerTextures(layerType, layerId) {
    if (layerType === l_ELEVATION) {
        return this.textures[l_ELEVATION];
    }

    const index = this.indexOfColorLayer(layerId);

    if (index !== -1) {
        const count = this.getTextureCountByLayerIndex(index);
        const textureIndex = this.getTextureOffsetByLayerIndex(index);
        return this.textures[l_COLOR].slice(textureIndex, textureIndex + count);
    } else {
        throw new Error(`Invalid layer id "${layerId}"`);
    }
};

export default LayeredMaterial;
