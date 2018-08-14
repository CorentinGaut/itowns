import * as THREE from 'three';
import proj4 from 'proj4';

const DEG2RAD = THREE.Math.DEG2RAD;

/** @module OrientationParser */
/**
 * The transform from world to local is  <pre>RotationZ(heading).RotationX(pitch).RotationY(roll)</pre>
 *
 * The transform from local to world is <pre>(RotationZ(heading).RotationX(pitch).RotationY(roll)).transpose()</pre>
 * @function setFromRollPitchHeading
 * @param {Number} roll - angle in degrees
 * @param {Number} pitch - angle in degrees
 * @param {Number} heading - angle in degrees
 * @param {THREE.Quaternion} target Quaternion to set
 * @returns {THREE.Quaternion} target
 */
function setFromRollPitchHeading(roll = 0, pitch = 0, heading = 0, target = new THREE.Quaternion()) {
    roll *= DEG2RAD;
    pitch *= DEG2RAD;
    heading *= DEG2RAD;
    return target.setFromEuler(new THREE.Euler(pitch, roll, heading, 'ZXY')).conjugate();
}

/**
 * From DocMicMac, the transform from local to world is:
 * <pre>
 * RotationX(omega).RotationY(phi).RotationZ(kappa).RotationX(PI)
 * RotationX(PI) <=> Quaternion(1,0,0,0) : converts between the 2 conventions for the camera local frame:
 * X right, Y bottom, Z front : convention in webGL, threejs and computer vision
 * X right, Y top,    Z back  : convention in photogrammetry
 * </pre>
 * @function setFromOmegaPhiKappa
 * @param {Number} omega - angle in degrees
 * @param {Number} phi - angle in degrees
 * @param {Number} kappa - angle in degrees
 * @param {THREE.Quaternion} target Quaternion to set
 * @returns {THREE.Quaternion} target
 */
function setFromOmegaPhiKappa(omega = 0, phi = 0, kappa = 0, target = new THREE.Quaternion()) {
    omega *= DEG2RAD;
    phi *= DEG2RAD;
    kappa *= DEG2RAD;
    target.setFromEuler(new THREE.Euler(omega, phi, kappa, 'XYZ'));
    target.set(target.w, target.z, -target.y, -target.x); // <=> target.multiply(new THREE.Quaternion(1, 0, 0, 0));
    return target;
}

/**
 * Properties are either defined as (omega, phi, kappa) or as (roll, pitch, heading) or all undefined.
 * @typedef Attitude
 * @type {Object}
 * @property {Number} omega - angle in degrees
 * @property {Number} phi - angle in degrees
 * @property {Number} kappa - angle in degrees
 * @property {Number} roll - angle in degrees
 * @property {Number} pitch - angle in degrees
 * @property {Number} heading - angle in degrees
 */

/**
 * @function setFromAttitude
 * @param {Attitude} attitude - [Attitude]{@link module:OrientedImageParser~Attitude}
 * @param {THREE.Quaternion} target Quaternion to set
 * @returns {THREE.Quaternion} target
 */
function setFromAttitude(attitude, target = new THREE.Quaternion()) {
    if ((attitude.roll !== undefined) || (attitude.pitch !== undefined) || (attitude.heading !== undefined)) {
        return setFromRollPitchHeading(attitude.roll, attitude.pitch, attitude.heading, target);
    }
    if ((attitude.omega !== undefined) || (attitude.phi !== undefined) || (attitude.kappa !== undefined)) {
        return setFromOmegaPhiKappa(attitude.omega, attitude.phi, attitude.kappa, target);
    }
    return target.set(0, 0, 0, 1);
}

/**
 * Set the quaternion according to the rotation from the East North Up (ENU) frame to the geocentric frame.
 * The up direction of the ENU frame is provided by the normalized geodetic normal of the provided coordinates (geodeticNormal property)
 * @function setENUFromCoordinatesGeocent
 * @param {Object} proj the geocent projection parsed by proj4
 * @param {Coordinates} coordinates - The origin of the East North Up (ENU) frame
 * @param {THREE.Quaternion} target - Quaternion to set
 * @returns {(THREE.Quaternion|function)} the modified target if coordinates is defined, or the curried function(target, coordinates) to later apply the function
 */
function setENUFromCoordinatesGeocent(proj, coordinates, target = new THREE.Quaternion()) {
    const matrix = new THREE.Matrix4();
    const north = new THREE.Vector3();
    const east = new THREE.Vector3();
    const setENUFromCoordinatesGeocent = (coordinates, target = new THREE.Quaternion()) => {
        const up = coordinates.geodesicNormal;
        if (up.x == 0 && up.y == 0) return target.set(0, 0, 0, 1);
        // this is an optimized version of matrix.lookAt(up, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 1));
        east.set(-up.y, up.x, 0).normalize();
        north.crossVectors(up, east);
        matrix.makeBasis(east, north, up);
        return target.setFromRotationMatrix(matrix);
    };
    return coordinates ? setENUFromCoordinatesGeocent(coordinates, target) : setENUFromCoordinatesGeocent;
}

/**
 * Set the quaternion to correct for the meridian convergence of the East North Up (ENU) frame to the Lambert Conformal Conic (LCC) frame.
 * This is a relatively small rotation around Z.
 * The origin of the ENU frame, The up direction being provided by the
 * normalized geodetic normal of the coordinates (geodeticNormal property)
 * @function setENUFromCoordinatesLCC
 * @param {Object} proj the lcc projection parsed by proj4
 * @param {Coordinates} coordinates - The origin of the East North Up (ENU) frame
 * @param {THREE.Quaternion} target - Quaternion to set
 * @returns {(THREE.Quaternion|function)} the modified target if coordinates is defined, or the curried function(target, coordinates) to later apply the function
*/
function setENUFromCoordinatesLCC(proj, coordinates, target = new THREE.Quaternion()) {
    const sinlat0 = Math.sin(proj.lat0);
    const axis = new THREE.Vector3().set(0, 0, 1);
    const setENUFromCoordinatesLCC = (coordinates, target = new THREE.Quaternion()) => {
        const long = coordinates.as('EPSG:4326').longitude() * DEG2RAD;
        return target.setFromAxisAngle(axis, sinlat0 * (proj.long0 - long));
    };
    return coordinates ? setENUFromCoordinatesLCC(coordinates, target) : setENUFromCoordinatesLCC;
}


/**
 * Warns for an unimplemented projection, set the quaternion to the identity (0,0,0,1).
 * @function setENUFromCoordinatesWarn
 * @param {Object} proj the unimplemented projection parsed by proj4
 * @param {Coordinates} coordinates -(unused)
 * @param {THREE.Quaternion} target - Quaternion to set
 * @returns {(THREE.Quaternion|function)} the modified target if coordinates is defined, or the curried function(target, coordinates) to later apply the function
 */
function setENUFromCoordinatesWarn(proj, coordinates, target = new THREE.Quaternion()) {
    console.warn('setENUFromCoordinatesCRS is not implemented for projections of type', proj.projName);
    const setENUFromCoordinatesWarn = (coordinates, target = new THREE.Quaternion()) => target.set(0, 0, 0, 1);
    return coordinates ? setENUFromCoordinatesWarn(coordinates, target) : setENUFromCoordinatesWarn;
}

/**
 * Compute the quaternion that models the rotation from the local East North Up (ENU) frame of the coordinates parameter to the frame of the given crs.
 * @function setENUFromCoordinatesCRS
 * @param {String} crs the CRS of the target frame.
 * @param {Coordinates} coordinates - the origin of the East North Up (ENU) frame
 * @param {THREE.Quaternion} target - Quaternion to set
 * @returns {(THREE.Quaternion|function)} the modified target if coordinates is defined, or the curried function(target, coordinates) to later apply the function
 */
var setENUFromCoordinates_cache = {};
function setENUFromCoordinatesCRS(crs, coordinates, target = new THREE.Quaternion()) {
    var setENUFromCoordinates = setENUFromCoordinates_cache[crs];
    if (!setENUFromCoordinates) {
        const proj = proj4.defs(crs);
        switch (proj.projName) {
            case 'geocent': setENUFromCoordinates = setENUFromCoordinatesGeocent(proj); break;
            case 'lcc': setENUFromCoordinates = setENUFromCoordinatesLCC(proj); break;
            default: setENUFromCoordinates = setENUFromCoordinatesWarn(proj);
        }
        setENUFromCoordinates_cache[crs] = setENUFromCoordinates;
    }
    return coordinates ? setENUFromCoordinates(coordinates, target) : setENUFromCoordinates;
}

export default {
    /** Parse feature properties, and add position and quaternion attributes.
     * @function parse
     * @param {Object} features - a JSON array of Point Features
     * @param {Object} options - additional properties.
     * @param {string} options.crsOut - the CRS of View (must be specified (as 'EPSG:4978') for GlobeView)
     * @return {Object} a promise that resolves with the features given in parameter
     */
    parse(features, options = {}) {
        const quat = new THREE.Quaternion();
        const setFromCoordinates = setENUFromCoordinatesCRS(options.crsOut);
        for (const feature of features) {
            const coordinates = feature.vertices[0];
            feature.position = coordinates.xyz();

            // get rotation from the local East/North/Up (ENU) frame to the coordinates CRS.
            feature.quaternion = setFromCoordinates(coordinates);

            // get the rotation to the local East/North/Up (ENU) frame, from the properties.
            feature.quaternion.multiply(setFromAttitude(feature.properties, quat));
        }

        return Promise.resolve(features);
    },
};
