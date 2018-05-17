import * as THREE from 'three';
import Distortion from './Distortion';

function getText(xml, tagName) {
    var node = xml.getElementsByTagName(tagName)[0];
    return node && node.childNodes[0].nodeValue.trim();
}

function getNumber(xml, tagName) {
    return Number(getText(xml, tagName));
}

function getNumbers(xml, tagName, dims) {
    var node = xml.getElementsByTagName(tagName)[0];
    return dims.map(dim => getNumber(node, dim));
}

function parseSpheric(xml, camera) {
    camera.lambdaphi = getNumbers(xml, 'frame', ['lambda_min', 'lambda_max', 'phi_min', 'phi_max']);
    // patching the ori.MatisOrientationParser..
    camera.size[1] = 718;
    camera.lambdaphi[2] = camera.lambdaphi[3] - camera.size[1] * (camera.lambdaphi[1] - camera.lambdaphi[0]) / camera.size[0];
    // set the projection to the top face of the cube map
    camera.projectionMatrix = new THREE.Matrix4().set(
        camera.size[0], 0, camera.size[0] * 0.5, 0,
        0, camera.size[1], camera.size[1] * 0.5, 0,
        0, 0, 0, 1,
        0, 0, 1, 0);
    return camera;
}

function parseConic(xml, camera) {
    var p = getNumbers(xml, 'ppa', ['c', 'l', 'focale']);
    camera.projectionMatrix = new THREE.Matrix4().set(
        p[2], 0, p[0], 0,
        0, p[2], p[1], 0,
        0, 0, 0, 1,
        0, 0, 1, 0);
    var disto = {
        C: getNumbers(xml, 'pps', ['c', 'l']), // distortion center
        R: getNumbers(xml, 'distortion', ['r3', 'r5', 'r7']), // radial distortion coefficients
        project: Distortion.projectRadial,
    };
    disto.r2max = Distortion.radial3_r2max(disto.R);
    camera.distos.push(disto);
    return camera;
}

function parseIntrinsics(xml) {
    var camera = {};
    camera.size = getNumbers(xml, 'image_size', ['width', 'height']);
    camera.distos = [];

    var spheric = xml.getElementsByTagName('spherique')[0];
    if (spheric) {
        return parseSpheric(spheric, camera);
    }

    var sensor = xml.getElementsByTagName('sensor')[0];
    if (sensor) {
        return parseConic(sensor, camera);
    }

    throw new Error('error parsing matis orientation');
}

function parseExtrinsics(xml) {
    xml = xml.getElementsByTagName('extrinseque')[0];
    var mat3d = xml.getElementsByTagName('mat3d')[0];
    var M = new THREE.Matrix4();

    if (mat3d) {
        var L1 = getNumbers(mat3d, 'l1', ['x', 'y', 'z']);
        var L2 = getNumbers(mat3d, 'l2', ['x', 'y', 'z']);
        var L3 = getNumbers(mat3d, 'l3', ['x', 'y', 'z']);
        M.set(
            L1[0], L1[1], L1[2], 0,
            L2[0], L2[1], L2[2], 0,
            L3[0], L3[1], L3[2], 0,
            0, 0, 0, 1);
    } else {
        var quat = getNumbers(xml, 'quaternion', ['x', 'y', 'z', 'w']);
        M.makeRotationFromQuaternion(new THREE.Quaternion().fromArray(quat));
    }

    if (!getText(xml, 'Image2Ground')) M.transpose();

    M.elements[12] = getNumber(xml, 'easting');
    M.elements[13] = getNumber(xml, 'northing');
    M.elements[14] = getNumber(xml, 'altitude');
    return M;
}

export default {
    /** @module MatisOrientationParser */
    /** Parse an orientation using the IGN Matis internal XML format
     * @function parse
     * @param {string|XMLDocument} xml - the xml content of the orientation file.
     * @return {Camera} - a camera.
     *
     */
    parse: function parse(xml) {
        if (!(xml instanceof Node)) {
            xml = new window.DOMParser().parseFromString(xml, 'text/xml');
        }
        if (xml.children[0].tagName !== 'orientation') {
            return undefined;
        }
        var camera = parseIntrinsics(xml);
        camera.matrixWorld = parseExtrinsics(xml);
        camera.projectionMatrixInverse = new THREE.Matrix4().getInverse(camera.projectionMatrix);
        camera.matrixWorldInverse = new THREE.Matrix4().getInverse(camera.projectionMatrix);
        camera.project = function project(p) {
            p = p.project(this);
            return this.distos.reduce((q, disto) => disto.project(q), p);
        };
        return camera;
    },
    format: 'matis/orientation',
    extensions: ['xml'],
    mimetypes: ['application/xml'],
    fetchtype: 'xml',
};
