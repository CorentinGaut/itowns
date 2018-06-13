import PrecisionQualifier from './Chunk/PrecisionQualifier.glsl';

const rePosition = new RegExp('gl_Position.*(?![^]*gl_Position)');
const reMain = new RegExp('[^\\w]*main[^\\w]*(void)?[^\\w]*{');

export default {
    patchMaterialForLogDepthSupport(material) {
        // Check if the shader does not already use the log depth buffer
        if (material.vertexShader.indexOf('USE_LOGDEPTHBUF') !== -1
            || material.vertexShader.indexOf('logdepthbuf_pars_vertex') !== -1) {
            return;
        }

        // Add vertex shader log depth buffer header
        material.vertexShader = `#include <logdepthbuf_pars_vertex>\n#define EPSILON 1e-6\n${material.vertexShader}`;
        // Add log depth buffer code snippet after last gl_Position modification
        let re = rePosition.exec(material.vertexShader);
        let idx = re[0].length + re.index;
        material.vertexShader = `${material.vertexShader.slice(0, idx)}\n#include <logdepthbuf_vertex>\n${material.vertexShader.slice(idx)}`;

        // Add fragment shader log depth buffer header
        material.fragmentShader = `${PrecisionQualifier}\n#include <logdepthbuf_pars_fragment>\n${material.fragmentShader}`;
        // Add log depth buffer code snippet at the first line of the main function
        re = reMain.exec(material.fragmentShader);
        idx = re[0].length + re.index;
        material.fragmentShader = `${material.fragmentShader.slice(0, idx)}\n#include <logdepthbuf_fragment>\n${material.fragmentShader.slice(idx)}`;

        material.defines = {
            USE_LOGDEPTHBUF: 1,
            USE_LOGDEPTHBUF_EXT: 1,
        };
    },

    // adapted from unrollLoops in WebGLProgram
    unrollLoops(string, defines) {
        // look for a for loop with an unroll_loop pragma
        // The detection of the scope of the for loop is hacky as it does not support nested scopes
        var pattern = /#pragma unroll_loop\s+for\s*\(\s*int\s+i\s*=\s*(\d+);\s*i\s+<\s+([\w\d]+);\s*i\s*\+\+\s*\)\s*\{([^}]*)\}/g;
        function replace(match, start, end, snippet) {
            var unroll = '';
            end = end in defines ? defines[end] : end;
            for (var i = parseInt(start, 10); i < parseInt(end, 10); i++) {
                unroll += snippet.replace(/\s+i\s+/g, ` ${i} `);
            }
            return unroll;
        }
        return string.replace(pattern, replace);
    },
};
