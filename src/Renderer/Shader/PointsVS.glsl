#include <precision_qualifier>
#include <project_pars_vertex>
#include <logdepthbuf_pars_vertex>
#define EPSILON 1e-6

uniform float size;

uniform bool pickingMode;
uniform float opacity;
uniform vec4 overlayColor;
attribute vec3 color;
attribute vec4 unique_id;

varying vec4 vColor;

void main() {
    
    if (pickingMode) {
        vColor = unique_id;
    } else {
        vColor = vec4(mix(color, overlayColor.rgb, overlayColor.a), opacity);
    }

    #include <begin_vertex>
    #include <project_vertex>

    if (size > 0.) {
        gl_PointSize = size;
    } else {
        gl_PointSize = clamp(-size / gl_Position.w, 3.0, 10.0);
    }

    #include <logdepthbuf_vertex>
}
