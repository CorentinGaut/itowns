import * as THREE from 'three';
import Fetcher from './Fetcher';
import Cache from '../Core/Scheduler/Cache';
import XbilParser from '../Parser/XbilParser';

export const SIZE_TEXTURE_TILE = 256;

const getTextureFloat = function getTextureFloat(buffer) {
    const texture = new THREE.DataTexture(buffer, SIZE_TEXTURE_TILE, SIZE_TEXTURE_TILE, THREE.AlphaFormat, THREE.FloatType);
    texture.needsUpdate = true;
    return texture;
};

export function getColorTextureByUrl(url, networkOptions) {
    return Cache.get(url) || Cache.set(url, Fetcher.texture(url, networkOptions)
        .then((texture) => {
            texture.generateMipmaps = false;
            texture.magFilter = THREE.LinearFilter;
            texture.minFilter = THREE.LinearFilter;
            texture.anisotropy = 16;
            return texture;
        }), Cache.POLICIES.TEXTURE);
}

export function getXBilTextureByUrl(url, networkOptions) {
    return Cache.get(url) || Cache.set(url, Fetcher.arrayBuffer(url, networkOptions)
        .then(buffer => XbilParser.parse(buffer, { url }))
        .then((result) => {
            // TODO  RGBA is needed for navigator with no support in texture float
            // In RGBA elevation texture LinearFilter give some errors with nodata value.
            // need to rewrite sample function in shader

            const texture = getTextureFloat(result.floatArray);
            texture.generateMipmaps = false;
            texture.magFilter = THREE.LinearFilter;
            texture.minFilter = THREE.LinearFilter;
            texture.min = result.min;
            texture.max = result.max;
            return texture;
        }), Cache.POLICIES.ELEVATION);
}
