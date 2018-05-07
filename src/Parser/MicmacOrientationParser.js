import * as THREE from 'three';

function getText(xml, tagName) {
    var node = xml.getElementsByTagName(tagName)[0];
    return node && node.childNodes[0].nodeValue.trim();
}

function getNumbers(xml, tagName, value) {
    var text = getText(xml, tagName);
    return text ? text.split(' ').map(Number) : value;
}

function getChildNumbers(xml, tagName) {
    return Array.from(xml.getElementsByTagName(tagName)).map(node => Number(node.childNodes[0].nodeValue));
}

function projectRad(p) {
    var x = p.x - this.C[0];
    var y = p.y - this.C[1];
    var r2 = x * x + y * y;
    var poly = 0;
    for (var i = this.R.length - 1; i >= 0; --i) {
        poly = (poly + this.R[i]) * r2;
    }
    p.x += poly * x;
    p.y += poly * y;
    return p;
}

function projectEbner(p) {
    console.warn('Ebner distortion has never been tested');
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

function projectDCBrown(p) {
    console.warn('DCBrown distortion has never been tested');
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

function projectPhgrStd(p) {
    var x = p.x - this.C[0];
    var y = p.y - this.C[1];
    var x2 = x * x;
    var y2 = y * y;
    var xy = x * y;
    var r2 = x2 + y2;
    var poly = 0;
    for (var i = this.R.length - 1; i >= 0; --i) {
        poly = (poly + this.R[i]) * r2;
    }
    p.x += this.b[0] * x + this.b[1] * y;
    p.x += poly * x + this.P[0] * (2 * x2 + r2) + this.P[1] * 2 * xy;
    p.y += poly * y + this.P[1] * (2 * y2 + r2) + this.P[0] * 2 * xy;
    return p;
}

function projectPolyDeg(p) {
    // Apply N normalization
    p.x = (p.x - this.C[0]) / this.S;
    p.y = (p.y - this.C[1]) / this.S;

    var R = this.R;
    var x = p.x;
    var y = p.y;

    // degree 2
    var X = [x * x, y * x, y * y];
    p.x += R[0] * x + R[1] * y + R[3] * X[1] - 2 * R[2] * X[0] + R[4] * X[2];
    p.y += R[1] * x - R[0] * y + R[2] * X[1] - 2 * R[3] * X[2] + R[5] * X[0];

    // degree 3+
    var i = 6;
    for (var d = 3; d <= this.degree; ++d) {
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
    p.x = this.C[0] + p.x * this.S;
    p.y = this.C[1] + p.y * this.S;
    return p;
}

function projectFishEye(p) {
    var A = (p.x - this.C[0]) / this.F;
    var B = (p.y - this.C[1]) / this.F;
    var R2 = A * A + B * B;
    var R = Math.sqrt(R2);
    var theta = Math.atan(R);
    if (this.equisolid) theta = 2 * Math.sin(0.5 * theta);
    var lambda = theta / R;
    var a = lambda * A;
    var b = lambda * B;
    var r2 = lambda * lambda * R2;
    var poly = 0;
    for (var i = this.R.length - 1; i >= 0; --i) {
        poly = (poly + this.R[i]) * r2;
    }
    ++poly;
    var a2 = a * a;
    var b2 = b * b;
    var ab = a * b;
    p.x = this.C[0] + this.F * (this.P[0] * (r2 + 2 * a2) + 2 * this.P[1] * ab + (poly + this.l[0]) * a + this.l[1] * b);
    p.y = this.C[1] + this.F * (this.P[1] * (r2 + 2 * b2) + 2 * this.P[1] * ab + poly * b + this.l[1] * a);
    return p;
}

function parseDistorsion(xml) {
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
        case 'ModRad':
            disto.C = getNumbers(xml, 'CDist'); // distorsion center in pixels
            disto.R = getChildNumbers(xml, 'CoeffDist', []); // radial distorsion coefficients
            disto.project = projectRad;
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
            for (var d = disto.degree - 1; d > 1; --d) {
                var l = d * (d + 3) - 4; // = length of R at degree d, as l(2)=6 and l(n)=l(n-1)+2n+2
                if (firstZero <= l) {
                    params = params.slice(0, l);
                    disto.degree = d;
                }
            }
            disto.R = params;
            disto.project = projectPolyDeg;
            return disto;
        case 'ModPhgrStd':
            disto.C = getNumbers(xml, 'CDist'); // distorsion center in pixels
            disto.R = getChildNumbers(xml, 'CoeffDist'); // radial distorsion coefficients
            disto.P = getNumbers(xml, 'P1').concat(getNumbers(xml, 'P2'));
            disto.b = getNumbers(xml, 'b1', [0]).concat(getNumbers(xml, 'b2', [0]));
            disto.project = projectPhgrStd;
            return disto;
        case 'eModeleEbner':
            disto.B2 = states[0] * states[0] * 2 / 3;
            disto.P = params;
            disto.project = projectEbner;
            return disto;
        case 'eModeleDCBrown':
            disto.F = states[0];
            disto.P = params;
            disto.project = projectDCBrown;
            return disto;
        case 'eModele_FishEye_10_5_5':
        case 'eModele_EquiSolid_FishEye_10_5_5':
            disto.F = states[0];
            disto.C = params.slice(0, 2);
            disto.R = params.slice(2, 7);
            disto.P = params.slice(12, 14);
            disto.l = params.slice(22, 24);
            disto.equisolid = disto.type === 'eModele_EquiSolid_FishEye_10_5_5';
            disto.project = projectFishEye;
            return disto;
        default:
            throw new Error(`Error parsing micmac orientation : unknown distorsion ${xml.tagName}`);
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
    camera.distos = Array.from(distos).map(parseDistorsion).reverse();
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

// ported from "cConvExplicite MakeExplicite(eConventionsOrientation aConv)" in micmac/src/ori_phot/orilib.cpp
function parseAngularConv(xml) {
    console.warn('parseAngularConv has never been tested');
    var KnownConv = getText(xml, 'KnownConv');
    var degree = THREE.Math.DEG2RAD;
    var grade = THREE.Math.DEG2RAD * 180 / 200;
    switch (KnownConv) {
        case 'eConvApero_DistM2C' : return { order: 'ZYX', scale: degree };
        case 'eConvApero_DistC2M' : return { order: 'ZYX', scale: degree };
        case 'eConvOriLib' : return { order: 'XYZ', scale: degree };
        case 'eConvMatrPoivillier_E' : return { order: 'XYZ', scale: degree };
        case 'eConvAngErdas' : return { order: 'XYZ', scale: degree };
        case 'eConvAngErdas_Grade' : return { order: 'XYZ', scale: grade };
        case 'eConvAngPhotoMDegre' : return { order: 'XYZ', scale: degree };
        case 'eConvAngPhotoMGrade' : return { order: 'XYZ', scale: grade };
        default: throw new Error(`Error parsing micmac orientation : unknown rotation convention : ${KnownConv}`);
    }
}

function parseExtrinsics(xml, conv) {
    var KnownConv = getText(xml, 'KnownConv');
    if (KnownConv !== 'eConvApero_DistM2C') {
        throw new Error(`Error parsing micmac orientation : unknown convention ${KnownConv}`);
    }
    var C = getNumbers(xml, 'Centre');

    xml = xml.getElementsByTagName('ParamRotation')[0];
    var encoding = xml && xml.children[0] ? xml.children[0].tagName : 'No or empty ParamRotation tag';
    switch (encoding) {
        case 'CodageMatr':
            var L1 = getNumbers(xml, 'L1');
            var L2 = getNumbers(xml, 'L2');
            var L3 = getNumbers(xml, 'L3');
            return new THREE.Matrix4().set(
                L1[0], L1[1], L1[2], C[0],
                L2[0], L2[1], L2[2], C[1],
                L3[0], L3[1], L3[2], C[2],
                0, 0, 0, 1);

        case 'CodageAngulaire':
            console.warn('CodageAngulaire has never been tested');
            conv = parseAngularConv(conv);
            var A = getNumbers(xml, 'CodageAngulaire').map(x => x * conv.scale);
            var E = new THREE.Euler(A[0], A[1], A[2], conv.order);
            var M = new THREE.Matrix4().makeRotationFromEuler(E);
            M.elements[12] = C[0];
            M.elements[13] = C[1];
            M.elements[14] = C[2];
            return M;

        default:
            throw new Error(`Error parsing micmac orientation, rotation encoding : ${encoding}`);
    }
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
