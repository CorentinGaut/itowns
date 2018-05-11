import * as THREE from 'three';

function getText(xml, tagName) {
    var node = xml.getElementsByTagName(tagName)[0];
    return node && node.childNodes[0].nodeValue.trim();
}

function getNumbers(xml, tagName, value) {
    var text = getText(xml, tagName);
    return text ? text.split(' ').filter(String).map(Number) : value;
}

function getChildNumbers(xml, tagName) {
    return Array.from(xml.getElementsByTagName(tagName)).map(node => Number(node.childNodes[0].nodeValue));
}

// polynom with coefficients c evaluated at x using Horner's method
function polynom(c, x) {
    var res = c[c.length - 1];
    for (var i = c.length - 2; i >= 0; --i) {
        res = res * x + c[i];
    }
    return res;
}

// https://github.com/micmacIGN/micmac/blob/e0008b7a084f850aa9db4dc50374bd7ec6984da6/src/photogram/phgr_ebner_brown_dist.cpp#L441-L475
// WithFraser=false
function projectRadial(p) {
    var x = p.x - this.C[0];
    var y = p.y - this.C[1];
    var r2 = x * x + y * y;
    var radial = r2 * polynom(this.R, r2);
    p.x += radial * x;
    p.y += radial * y;
    return p;
}

// https://github.com/micmacIGN/micmac/blob/e0008b7a084f850aa9db4dc50374bd7ec6984da6/src/photogram/phgr_ebner_brown_dist.cpp#L441-L475
// WithFraser=true
function projectFraser(p) {
    var x = p.x - this.C[0];
    var y = p.y - this.C[1];
    var x2 = x * x;
    var y2 = y * y;
    var xy = x * y;
    var r2 = x2 + y2;
    var radial = r2 * polynom(this.R, r2);
    p.x += radial * x + this.P[0] * (2 * x2 + r2) + this.P[1] * 2 * xy;
    p.y += radial * y + this.P[1] * (2 * y2 + r2) + this.P[0] * 2 * xy;
    p.x += this.b[0] * x + this.b[1] * y;
    return p;
}

// https://github.com/micmacIGN/micmac/blob/e0008b7a084f850aa9db4dc50374bd7ec6984da6/src/photogram/phgr_ebner_brown_dist.cpp#L361-L396
function projectEbner(p) {
    var x = p.x;
    var y = p.y;
    var x2 = x * x - this.B2;
    var y2 = y * y - this.B2;
    var xy = x * y;
    var xy2 = x * y2;
    var yx2 = y * x2;
    var x2y2 = x2 * y2;
    var P = this.P;
    p.x += P[0] * x + P[1] * y + P[3] * xy - 2 * P[2] * x2 + P[4] * y2 + P[6] * xy2 + P[8] * yx2 + P[10] * x2y2;
    p.y += P[1] * x - P[0] * y + P[2] * xy - 2 * P[3] * y2 + P[5] * x2 + P[9] * xy2 + P[7] * yx2 + P[11] * x2y2;
    return p;
}

// https://github.com/micmacIGN/micmac/blob/e0008b7a084f850aa9db4dc50374bd7ec6984da6/src/photogram/phgr_ebner_brown_dist.cpp#L401-L439
function projectBrown(p) {
    var x = p.x;
    var y = p.y;
    var x2 = x * x;
    var y2 = y * y;
    var xy = x * y;
    var xy2 = x * y2;
    var yx2 = y * x2;
    var x2y2 = x2 * y2;
    var P = this.P;
    var f = (P[12] * x2y2 / this.F) + (P[13] * (x2 + y2));
    p.x += P[0] * x + P[1] * y;
    p.x += P[2] * xy + P[3] * y2 + P[4] * yx2 + P[5] * xy2 + P[6] * x2y2 + f * x;
    p.y += P[7] * xy + P[8] * x2 + P[9] * yx2 + P[10] * xy2 + P[11] * x2y2 + f * y;
    return p;
}

// https://github.com/micmacIGN/micmac/blob/e0008b7a084f850aa9db4dc50374bd7ec6984da6/src/photogram/phgr_ebner_brown_dist.cpp#L527-L591
function projectPolynom(p) {
    // Apply N normalization
    p.x = (p.x - this.C[0]) / this.S;
    p.y = (p.y - this.C[1]) / this.S;

    var R = this.R;
    var x = p.x;
    var y = p.y;

    // degree 2
    var X = [x * x, x * y, y * y];
    p.x += R[0] * x + R[1] * y + R[3] * X[1] - 2 * R[2] * X[0] + R[4] * X[2];
    p.y += R[1] * x - R[0] * y + R[2] * X[1] - 2 * R[3] * X[2] + R[5] * X[0];

    // degree 3+
    var i = 6;
    for (var d = 3; i < R.length; ++d) {
        var j = i + d + 1;
        X[d] = y * X[d - 1];
        for (var l = 0; l < d; ++l) {
            X[l] *= x;
            p.x += R[i + l] * X[l];
            p.y += R[j + l] * X[l];
        }
        p.x += R[i + d] * X[d];
        p.y += R[j + d] * X[d];
        i = j + d + 1;
    }

    // Unapply N normalization
    p.x = this.C[0] + this.S * p.x;
    p.y = this.C[1] + this.S * p.y;
    return p;
}

// https://github.com/micmacIGN/micmac/blob/e0008b7a084f850aa9db4dc50374bd7ec6984da6/src/photogram/phgr_ebner_brown_dist.cpp#L2169-L2352
function projectFishEye(p) {
    // Apply N normalization
    var A = (p.x - this.C[0]) / this.F;
    var B = (p.y - this.C[1]) / this.F;
    var R = Math.sqrt(A * A + B * B);
    var theta = Math.atan(R);
    if (this.equisolid) theta = 2 * Math.sin(0.5 * theta);
    var lambda = theta / R;
    var x = lambda * A;
    var y = lambda * B;
    var x2 = x * x;
    var xy = x * y;
    var y2 = y * y;
    var r2 = x2 + y2;

    // radial distortion and degree 1 polynomial
    var radial = 1 + r2 * polynom(this.R, r2);
    p.x = y * this.l[1] + x * (radial + this.l[0]);
    p.y = x * this.l[1] + y * radial;

    // tangential distortion
    var rk = 1;
    for (var k = 0; k < this.P.length; k += 2) {
        var K = k + 2;
        p.x += rk * ((r2 + K * x2) * this.P[k] + this.P[k + 1] * K * xy);
        p.y += rk * ((r2 + K * y2) * this.P[k + 1] + this.P[k] * K * xy);
        rk *= r2;
    }

    // degree 3+ polynomial (no degree 2)
    var X = [x2, xy, y2];
    var j = 2;
    for (var d = 3; j < this.l.length; ++d) {
        X[d] = y * X[d - 1];
        X[0] *= x;
        p.y += this.l[j++] * X[0];
        for (var l = 1; l < d; ++l) {
            X[l] *= x;
            p.x += this.l[j++] * X[l];
            p.y += this.l[j++] * X[l];
        }
        p.x += this.l[j++] * X[d];
        if (d % 2) {
            p.y += this.l[j++] * X[d];
        }
    }

    // Unapply N normalization
    p.x = this.C[0] + this.F * p.x;
    p.y = this.C[1] + this.F * p.y;
    return p;
}

// if anyone needs support for RadFour7x2, RadFour11x2, RadFour15x2 or RadFour19x2, micmac code is here :
// https://github.com/micmacIGN/micmac/blob/e0008b7a084f850aa9db4dc50374bd7ec6984da6/src/photogram/phgr_ebner_brown_dist.cpp#L720-L875

function parseDistortion(xml) {
    xml = xml.children[0];
    var disto = { type: xml.tagName };
    var params;
    var states;
    if (disto.type === 'ModUnif') {
        disto.type = getText(xml, 'TypeModele');
        params = getChildNumbers(xml, 'Params');
        states = getChildNumbers(xml, 'Etats');
    }

    switch (disto.type) {
        case 'ModNoDist':
            return undefined;
        case 'ModRad':
            disto.C = getNumbers(xml, 'CDist'); // distortion center in pixels
            disto.R = getChildNumbers(xml, 'CoeffDist', []); // radial distortion coefficients
            disto.project = projectRadial;
            return disto;
        case 'eModelePolyDeg2':
        case 'eModelePolyDeg3':
        case 'eModelePolyDeg4':
        case 'eModelePolyDeg5':
        case 'eModelePolyDeg6':
        case 'eModelePolyDeg7':
            disto.S = states[0];
            disto.C = states.slice(1, 3);
            disto.degree = Number(disto.type.substr('eModelePolyDeg'.length));

            // degree could be decreased if params has a long enough tail of zeroes
            var firstZero = params.length - params.reverse().findIndex(x => x !== 0);
            params.reverse();
            for (var d = disto.degree - 1; d > 0; --d) {
                var l = d * (d + 3) - 4; // = length of R at degree d, as l(2)=6 and l(n)=l(n-1)+2n+2
                if (firstZero <= l) {
                    params = params.slice(0, l);
                    disto.degree = d;
                }
            }
            disto.R = params;
            disto.project = projectPolynom;
            return disto;
        case 'ModPhgrStd':
            disto.C = getNumbers(xml, 'CDist'); // distortion center in pixels
            disto.R = getChildNumbers(xml, 'CoeffDist'); // radial distortion coefficients
            disto.P = getNumbers(xml, 'P1', [0]).concat(getNumbers(xml, 'P2', [0]));
            disto.b = getNumbers(xml, 'b1', [0]).concat(getNumbers(xml, 'b2', [0]));
            disto.project = projectFraser;
            return disto;
        case 'eModeleEbner':
            disto.B2 = states[0] * states[0] / 1.5;
            disto.P = params;
            disto.project = projectEbner;
            return disto;
        case 'eModeleDCBrown':
            disto.F = states[0];
            disto.P = params;
            disto.project = projectBrown;
            return disto;
        case 'eModele_FishEye_10_5_5':
        case 'eModele_EquiSolid_FishEye_10_5_5':
            disto.F = states[0];
            disto.C = params.slice(0, 2);
            disto.R = params.slice(2, 12);
            disto.P = params.slice(12, 22);
            disto.l = params.slice(22);
            disto.equisolid = disto.type === 'eModele_EquiSolid_FishEye_10_5_5';
            disto.project = projectFishEye;
            return disto;
        default:
            throw new Error(`Error parsing micmac orientation : unknown distortion ${xml.tagName}`);
    }
}

function parseIntrinsics(xml) {
    if (!xml) {
        throw new Error('Error parsing micmac orientation, no intrinsics');
    }
    if (!(xml instanceof Node)) {
        xml = new window.DOMParser().parseFromString(xml, 'text/xml');
    }
    var camera = {};
    var KnownConv = getText(xml, 'KnownConv');
    if (KnownConv !== 'eConvApero_DistM2C') {
        throw new Error(`Error parsing micmac orientation : unknown convention ${KnownConv}`);
    }
    var f = getNumbers(xml, 'F'); // focal length in pixels
    var p = getNumbers(xml, 'PP'); // image projection center in pixels
    var distos = xml.getElementsByTagName('CalibDistortion');
    var rmax = getNumbers(xml, 'RayonUtile', [])[0];
    f[1] = f[1] || f[0]; // fy defaults to fx

    camera.size = getNumbers(xml, 'SzIm'); // image size in pixels
    camera.distos = Array.from(distos)
        .map(parseDistortion)
        .filter(x => x) // filter undefined values
        .reverse(); // see the doc
    // projectionMatrix turns metric camera coordinates (x left, y down, z front) to pixel coordinates (0,0 is top left) and inverse depth (m^-1)
    camera.projectionMatrix = new THREE.Matrix4().set(
        f[0], 0, p[0], 0,
        0, f[1], p[1], 0,
        0, 0, 0, 1,
        0, 0, 1, 0);
    camera.projectionMatrixInverse = new THREE.Matrix4();
    camera.projectionMatrixInverse.getInverse(camera.projectionMatrix);
    if (rmax) {
        camera.r2max = rmax * rmax;
    }
    return camera;
}

// https://github.com/micmacIGN/micmac/blob/e0008b7a084f850aa9db4dc50374bd7ec6984da6/src/ori_phot/orilib.cpp#L3069-L3190
function parseConv(xml) {
    var KnownConv = getText(xml, 'KnownConv');
    if (!KnownConv) return undefined;
    var degree = THREE.Math.DEG2RAD;
    var grade = THREE.Math.DEG2RAD * 180 / 200;
    var lin = [1, 1, 1];
    var Cardan = true;
    switch (KnownConv) {
        case 'eConvApero_DistM2C' : return { Cardan, lin, Video: true, DistC2M: false, MatrC2M: true, col: [1, 1, 1], scale: degree, order: 'ZYX' };
        case 'eConvApero_DistC2M': return { Cardan, lin, Video: true, DistC2M: true, MatrC2M: true, col: [1, 1, 1], scale: degree, order: 'ZYX' };
        case 'eConvOriLib': return { Cardan, lin, Video: true, DistC2M: false, MatrC2M: true, col: [1, 1, 1], scale: degree, order: 'XYZ' };
        case 'eConvMatrPoivillier_E': return { Cardan, lin, Video: false, DistC2M: false, MatrC2M: false, col: [1, -1, -1], scale: degree, order: 'XYZ' };
        case 'eConvAngErdas' : return { Cardan, lin, Video: true, DistC2M: false, MatrC2M: false, col: [1, -1, -1], scale: degree, order: 'XYZ' };
        case 'eConvAngErdas_Grade': return { Cardan, lin, Video: true, DistC2M: false, MatrC2M: false, col: [1, -1, -1], scale: grade, order: 'XYZ' };
        case 'eConvAngPhotoMDegre': return { Cardan, lin, Video: true, DistC2M: false, MatrC2M: true, col: [1, -1, -1], scale: degree, order: 'XYZ' };
        case 'eConvAngPhotoMGrade': return { Cardan, lin, Video: true, DistC2M: false, MatrC2M: true, col: [1, -1, -1], scale: grade, order: 'XYZ' };
        case 'eConvMatrixInpho': return { Cardan, lin, Video: true, DistC2M: false, MatrC2M: false, col: [1, -1, -1], scale: undefined, order: 'XYZ' };
        case 'eConvAngLPSDegre': return { Cardan, lin, Video: true, DistC2M: false, MatrC2M: true, col: [1, -1, -1], scale: degree, order: 'YXZ' };
        default: throw new Error(`Error parsing micmac orientation : unknown rotation convention : ${KnownConv}`);
    }
}

// https://github.com/micmacIGN/micmac/blob/e0008b7a084f850aa9db4dc50374bd7ec6984da6/src/ori_phot/orilib.cpp#L4127-L4139
// https://github.com/micmacIGN/micmac/blob/bee473615bec715884aaa639642add0812e8c378/src/uti_files/CPP_Ori_txt2Xml.cpp#L1546-L1600
function parseExtrinsics(xml, conv) {
    conv = parseConv(xml) || parseConv(conv);
    var C = getNumbers(xml, 'Centre');

    xml = xml.getElementsByTagName('ParamRotation')[0];
    var encoding = xml && xml.children[0] ? xml.children[0].tagName : 'No or empty ParamRotation tag';
    var M = new THREE.Matrix4();
    switch (encoding) {
        case 'CodageMatr':
            var L1 = getNumbers(xml, 'L1');
            var L2 = getNumbers(xml, 'L2');
            var L3 = getNumbers(xml, 'L3');
            M.set(
                L1[0], L1[1], L1[2], 0,
                L2[0], L2[1], L2[2], 0,
                L3[0], L3[1], L3[2], 0,
                0, 0, 0, 1);
            break;

        case 'CodageAngulaire':
            console.warn('CodageAngulaire has never been tested');
            var A = getNumbers(xml, 'CodageAngulaire').map(x => x * conv.scale);
            var E = new THREE.Euler(A[0], A[1], A[2], conv.order);
            M.makeRotationFromEuler(E);
            break;

        default:
            throw new Error(`Error parsing micmac orientation, rotation encoding : ${encoding}`);
    }
    if (!conv.MatrC2M) M.transpose();
    for (var i = 0; i < 3; ++i) {
        for (var j = 0; j < 3; ++j) {
            // it is one or the other (to be checked):
            // M.elements[4*j+i] *= conv.col[i] * conv.lin[j];
            M.elements[4 * j + i] *= conv.col[j] * conv.lin[i];
        }
    }
    // setup the translation
    M.elements[12] = C[0];
    M.elements[13] = C[1];
    M.elements[14] = C[2];
    return M;
}

function parseInternal(xml) {
    var C = getNumbers(xml, 'I00');
    var X = getNumbers(xml, 'V10');
    var Y = getNumbers(xml, 'V01');
    if (C[0] === 0 && C[1] === 0 && X[0] === 1 && X[1] === 0 && Y[0] === 0 && Y[1] === 1) {
        return undefined;
    }
    return new THREE.Matrix4().set(
            X[0], Y[0], 0, C[0],
            X[1], Y[1], 0, C[1],
            0, 0, 1, 0,
            0, 0, 0, 1);
}

function parseOrientation(internal, intrinsics, extrinsics, conv, verif) {
    var camera = parseIntrinsics(intrinsics);
    camera.matrixWorld = parseExtrinsics(extrinsics, conv);
    camera.matrixWorldInverse = new THREE.Matrix4();
    camera.matrixWorldInverse.getInverse(camera.matrixWorld);
    internal = parseInternal(internal);
    if (internal) {
        camera.matrixImage = internal;
    }
    camera.project = function project(p, skipImage) {
        p = p.project(this);
        p = this.distos.reduce((q, disto) => disto.project(q), p);
        if (this.matrixImage && !skipImage) {
            p.applyMatrix4(this.matrixImage);
        }
        return p;
    };
    if (verif) {
        camera.checkEpsilon = getNumbers(verif, 'Tol')[0];
        camera.check = function check(epsilon) {
            epsilon = epsilon || this.checkEpsilon;
            return Array.from(verif.getElementsByTagName('Appuis')).reduce((ok, point) => {
                var id = getNumbers(point, 'Num')[0];
                var p2 = new THREE.Vector2().fromArray(getNumbers(point, 'Im'));
                var p3 = new THREE.Vector3().fromArray(getNumbers(point, 'Ter'));
                var pp = camera.project(p3.clone(), true);
                var d = p2.distanceTo(pp);
                if (d > epsilon) {
                    ok = false;
                    console.warn(id, d, pp, p2, p3);
                }
                return ok;
            }, true);
        };
    }
    return camera;
}


export default {
    /** @module MicmacOrientationParser */
    /** Parse an Orientation*.xml from Micmac (see {@link https://github.com/micmacIGN})
     * @function parse
     * @param {string|XMLDocument} xml - the xml content of the oriention file.
     * @param {Object} options : path
     * @return {Promise} - a promise that resolves with a THREE.Points.
     *
     */
    parse: function parse(xml, options = {}) {
        options.path = options.path || '';
        if (!(xml instanceof Node)) {
            xml = new window.DOMParser().parseFromString(xml, 'text/xml');
        }
        xml = xml.getElementsByTagName('OrientationConique')[0];
        if (!xml) return undefined;

        var file = getText(xml, 'FileInterne');
        var TypeProj = getText(xml, 'TypeProj');
        if (TypeProj !== 'eProjStenope') {
            throw new Error(`Error parsing micmac orientation : unknown projection type ${TypeProj}`);
        }

        var intrinsics = xml.getElementsByTagName('Interne')[0];
        var extrinsics = xml.getElementsByTagName('Externe')[0];
        var internal = xml.getElementsByTagName('OrIntImaM2C')[0];
        var verif = xml.getElementsByTagName('Verif')[0];
        var conv = xml.getElementsByTagName('ConvOri')[0];

        if (intrinsics) {
            return Promise.resolve(parseOrientation(internal, intrinsics, extrinsics, conv, verif));
        } else if (file) {
            // 'RelativeNameFI' is not considered, since it is likely not making sense in a web context
            // options.path is to be used instead
            var url = options.path + file;
            return options.fetch(url, 'text')
            .then(intrinsics => parseOrientation(internal, intrinsics, extrinsics, conv, verif));
        } else {
            throw new Error('Error parsing micmac orientation : no intrinsics');
        }
    },
    format: 'micmac/orientation',
    extensions: ['xml'],
    mimetypes: ['application/xml'],
    fetchtype: 'xml',
};
