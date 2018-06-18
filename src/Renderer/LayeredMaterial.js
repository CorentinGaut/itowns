import * as THREE from 'three';
import TileVS from './Shader/TileVS.glsl';
import TileFS from './Shader/TileFS.glsl';
import ShaderUtils from './Shader/ShaderUtils';
import Capabilities from '../Core/System/Capabilities';
import { EMPTY_TEXTURE_ZOOM } from './LayeredMaterialConstants';
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

var identityOffsetScale = new THREE.Vector4(0.0, 0.0, 1.0, 1.0);

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

class LayeredMaterialLayer {
    constructor(options) {
        this.id = options.id;
        this.textureOffset = 0; // will be updated in updateUniforms()
        this.wgs84 = (options.texturesCount !== undefined ? options.texturesCount : 1) == 1;
        this.effect = options.effect !== undefined ? options.effect : 0;
        this.opacity = options.opacity !== undefined ? options.opacity : 1;
        this.visible = options.visible !== undefined ? options.visible : true;
        this.textures = [];
        this.offsetScales = [];
        this.level = EMPTY_TEXTURE_ZOOM;
        // this.needsUpdate = false;
    }

    dispose() {
        // TODO: WARNING  verify if textures to dispose aren't attached with ancestor
        for (const texture of this.textures) {
            if (texture instanceof THREE.Texture) {
                texture.dispose();
            }
        }
        this.level = EMPTY_TEXTURE_ZOOM;
        this.textures = [];
        this.offsetScales = [];
        // this.needsUpdate = true;
    }

    setTexture(index, texture, offsetScale) {
        this.level = (texture && (index == 0)) ? texture.coords.zoom : this.level;
        this.textures[index] = texture || null;
        this.offsetScales[index] = offsetScale || identityOffsetScale;
        // this.needsUpdate = true;
    }

    setTextures(textures) {
        this.dispose();
        for (let i = 0, il = textures.length; i < il; i++) {
            if (textures[i]) {
                this.setTexture(i, textures[i].texture, textures[i].pitch);
            }
        }
    }
}

function defineUniform(object, property, initValue) {
    object.uniforms[property] = new THREE.Uniform(initValue);
    Object.defineProperty(object, property, {
        get: () => object.uniforms[property].value,
        set: (value) => {
            object.uniformsNeedUpdate |= object.uniforms[property].value != value;
            object.uniforms[property].value = value;
        },
    });
}

class LayeredMaterial extends THREE.RawShaderMaterial {
    constructor(options = {}) {
        super(options);

        const maxTexturesUnits = Math.min(Capabilities.getMaxTextureUnitsCount(), 16) - 1;
        const nbSamplers = [1, maxTexturesUnits];

        this.defines.NUM_VS_TEXTURES = nbSamplers[0];
        this.defines.NUM_FS_TEXTURES = nbSamplers[1];

        if (__DEBUG__) {
            this.defines.DEBUG = 1;
            defineUniform(this, 'showOutline', false);
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

        if (Capabilities.isLogDepthBufferSupported()) {
            this.defines.USE_LOGDEPTHBUF = 1;
            this.defines.USE_LOGDEPTHBUF_EXT = 1;
        }

        this.vertexShader = TileVS;
        this.fragmentShader = ShaderUtils.unrollLoops(TileFS, this.defines);

        // Color uniforms
        defineUniform(this, 'noTextureColor', new THREE.Color(0.04, 0.23, 0.35));
        defineUniform(this, 'opacity', this.opacity);

        // Lighting uniforms
        defineUniform(this, 'lightingEnabled', false);
        defineUniform(this, 'lightPosition', new THREE.Vector3(-0.5, 0.0, 1.0));

        // Misc properties
        defineUniform(this, 'distanceFog', 1000000000.0);
        defineUniform(this, 'selected', false);
        defineUniform(this, 'uuid', 0);

        // LayeredMaterialLayers
        this.layers = {};
        this.elevationLayerIds = [];
        this.colorLayerIds = [];

        // elevation layer uniforms, to be updated using updateUniforms()
        this.uniforms.elevationLayers = new THREE.Uniform(new Array(nbSamplers[0]).fill({}));
        this.uniforms.elevationTextures = new THREE.Uniform(new Array(nbSamplers[0]).fill(null));
        this.uniforms.elevationOffsetScales = new THREE.Uniform(new Array(nbSamplers[0]).fill(identityOffsetScale));
        this.uniforms.elevationTextureCount = new THREE.Uniform(0);

        // color layer uniforms, to be updated using updateUniforms()
        this.uniforms.colorLayers = new THREE.Uniform(new Array(nbSamplers[1]).fill({}));
        this.uniforms.colorTextures = new THREE.Uniform(new Array(nbSamplers[1]).fill(null));
        this.uniforms.colorOffsetScales = new THREE.Uniform(new Array(nbSamplers[1]).fill(identityOffsetScale));
        this.uniforms.colorTextureCount = new THREE.Uniform(0);

        // transitory setup with a single hard-coded elevation layer
        this.elevationLayer = this.addLayer({ id: 'elevation' });
        this.elevationLayerIds[0] = this.elevationLayer.id;
    }

    _updateUniforms(color) {
        const layerIds = color ? this.colorLayerIds : this.elevationLayerIds;
        // prepare convenient access to elevation or color uniforms
        const u = this.uniforms;
        const layers = (color ? u.colorLayers : u.elevationLayers).value;
        const textures = (color ? u.colorTextures : u.elevationTextures).value;
        const offsetScales = (color ? u.colorOffsetScales : u.elevationOffsetScales).value;
        const textureCount = color ? u.colorTextureCount : u.elevationTextureCount;

        // flatten the 2d array [i,j] -> layers[_layerIds[i]].textures[j]
        const max = this.defines[color ? 'NUM_FS_TEXTURES' : 'NUM_VS_TEXTURES'];
        let count = 0;
        for (const layerId of layerIds) {
            const layer = this.layers[layerId];
            if (layer && layer.visible && layer.opacity > 0) {
                layer.textureOffset = count;
                for (let i = 0, il = layer.textures.length; i < il; ++i) {
                    if (count < max) {
                        offsetScales[count] = layer.offsetScales[i];
                        textures[count] = layer.textures[i];
                        layers[count] = layer;
                    }
                    count++;
                }
            }
        }
        if (count > max) {
            console.warn(`LayeredMaterial: Not enough texture units (${max} < ${count}), excess textures have been discarded.`);
        }
        textureCount.value = count;
    }

    updateUniforms() {
        this._updateUniforms(0); // elevation uniforms
        this._updateUniforms(1); // color uniforms
        this.uniformsNeedUpdate = true;
    }

    dispose() {
        this.dispatchEvent({ type: 'dispose' });
        Object.keys(this.layers).forEach(id => this.layers[id].dispose());
    }

    setSequence(sequenceLayer) {
        this.colorLayerIds = sequenceLayer;
        this.updateUniforms();
    }

    removeLayer(layerId) {
        const layer = this.layers[layerId];
        if (layer) {
            layer.dispose();
            delete this.layers[layerId];
            this.updateUniforms();
        }
    }

    addLayer(param) {
        // check if (param.id in this.layers) ?
        const layer = new LayeredMaterialLayer(param);
        this.layers[param.id] = layer;
        return layer;
    }

    getLayer(layerId) {
        return this.layers[layerId];
    }

    getElevationLayer() {
        return this.elevationLayer;
    }
}

export default LayeredMaterial;
