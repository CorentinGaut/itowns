import * as THREE from 'three';

const DEG2RAD = THREE.Math.DEG2RAD;

// The transform from world to local is  RotationZ(heading).RotationX(pitch).RotationY(roll)
// The transform from local to world is (RotationZ(heading).RotationX(pitch).RotationY(roll)).transpose()
function setFromRollPitchHeading(target = new THREE.Quaternion(), roll = 0, pitch = 0, heading = 0) {
    roll *= DEG2RAD;
    pitch *= DEG2RAD;
    heading *= DEG2RAD;
    // return this.setFromEuler(new THREE.Euler(pitch, roll, heading , 'ZXY')).conjugate();
    return target.setFromEuler(new THREE.Euler(-pitch, -roll, -heading, 'YXZ')); // optimized version of above
}

// From DocMicMac, the transform from local to world is:
// RotationX(omega).RotationY(phi).RotationZ(kappa).RotationX(PI)
// RotationX(PI) = Scale(1, -1, -1) converts between the 2 conventions for the camera local frame:
//  X right, Y bottom, Z front : convention in webGL, threejs and computer vision
//  X right, Y top,    Z back  : convention in photogrammetry
function setFromOmegaPhiKappa(target = new THREE.Quaternion(), omega = 0, phi = 0, kappa = 0) {
    omega *= DEG2RAD;
    phi *= DEG2RAD;
    kappa *= DEG2RAD;
    target.setFromEuler(new THREE.Euler(omega, phi, kappa, 'XYZ'));
    // this.setFromRotationMatrix(new THREE.Matrix4().makeRotationFromQuaternion(this).scale(new THREE.Vector3(1, -1, -1)));
    target.set(target.w, target.z, -target.y, -target.x); // optimized version of above
    return target;
}

// Set East North Up Orientation from geodesic normal
// target - the quaternion to set
// up - the normalized geodetic normal to the ellipsoid (given by Coordinates.geodeticNormal)
var setENUFromGeodesicNormal = (() => {
    const matrix = new THREE.Matrix4();
    const elements = matrix.elements;
    const north = new THREE.Vector3();
    const east = new THREE.Vector3();
    return function setENUFromGeodesicNormal(target = new THREE.Quaternion(), up) {
        // this is an optimized version of matrix.lookAt(up, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 1));
        east.set(-up.y, up.x, 0);
        east.normalize();
        north.crossVectors(up, east);
        north.normalize();
        elements[0] = east.x; elements[4] = north.x; elements[8] = up.x;
        elements[1] = east.y; elements[5] = north.y; elements[9] = up.y;
        elements[2] = east.z; elements[6] = north.z; elements[10] = up.z;
        return target.setFromRotationMatrix(matrix);
    };
})();

/**
 *
 * @typedef Attitude
 * @type {Object}
 *
 * @property {Number} omega - angle in degrees
 * @property {Number} phi - angle in degrees
 * @property {Number} kappa - angle in degrees
 * @property {Number} roll - angle in degrees
 * @property {Number} pitch - angle in degrees
 * @property {Number} heading - angle in degrees
 */

/**
 * @function setFromAttitude
 * @param {THREE.Quaternion} target Quaternion to set
 * @param {Attitude} attitude - [Attitude]{@link module:OrientedImageParser~Attitude}
 * with properties: (omega, phi, kappa), (roll, pitch, heading) or none.
 * @returns {THREE.Quaternion} target
 */
function setFromAttitude(target = new THREE.Quaternion(), attitude) {
    if ((attitude.roll !== undefined) || (attitude.pitch !== undefined) || (attitude.heading !== undefined)) {
        return setFromRollPitchHeading(target, attitude.roll, attitude.pitch, attitude.heading);
    }
    if ((attitude.omega !== undefined) || (attitude.phi !== undefined) || (attitude.kappa !== undefined)) {
        return setFromOmegaPhiKappa(target, attitude.omega, attitude.phi, attitude.kappa);
    }
    return target.set(0, 0, 0, 1);
}

export default {
    /** @module OrientationParser */
    /** Parse features properties, and add position and quaternion attributes.
     * @function parse
     * @param {Object} features - a JSON array of Point Features
     * @param {Object} options - additional properties.
     * @param {string} options.crsOut - the CRS of View (must be specified (as 'EPSG:4978') for GlobeView)
     * @return {Object} a promise that resolves with the features given in parameter
     */
    parse(features, options = {}) {
        const needsENUFromGeodesicNormal = options.crsOut == 'EPSG:4978';

        const ENUQuat = new THREE.Quaternion();
        for (const feature of features) {
            const coordinates = feature.vertices[0];
            feature.position = coordinates.xyz();

            // compute orientation
            feature.quaternion = setFromAttitude(new THREE.Quaternion(), feature.properties);

            // specific transformation for globe view
            if (needsENUFromGeodesicNormal) {
                // get rotation from ECEF to the local East/North/Up (ENU) frame.
                setENUFromGeodesicNormal(ENUQuat, coordinates.geodesicNormal);
                feature.quaternion.premultiply(ENUQuat);
            }
        }
        return Promise.resolve(features);
    },
};
