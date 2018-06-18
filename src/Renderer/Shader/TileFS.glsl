#include <itowns.precision_qualifier>
#include <itowns.pitUV>
#include <logdepthbuf_pars_fragment>

// BUG CHROME 50 UBUNTU 16.04
// Lose context on compiling shader with too many IF STATEMENT
// runconformance/glsl/bugs/conditional-discard-in-loop.html
// conformance/glsl/bugs/nested-loops-with-break-and-continue.html
// Resolve CHROME unstable 52


uniform sampler2D   colorTextures[NUM_FS_TEXTURES];
uniform vec4        colorOffsetScales[NUM_FS_TEXTURES];

struct Layer {
    int textureOffset;
    int crs;
    float effect;
    float opacity;
};

uniform Layer       colorLayers[NUM_FS_TEXTURES];
uniform int         colorTextureCount;

uniform float       distanceFog;
const   vec3        fogColor = vec3( 0.76, 0.85, 1.0);
uniform vec3        lightPosition;

uniform vec3        noTextureColor;
uniform float       opacity;

// Options global
uniform bool        selected;
const   vec3        selectedColor = vec3(1.0, 0.3, 0.0);
uniform bool        lightingEnabled;

varying vec2        vUv_WGS84;
varying float       vUv_PM;
varying vec3        vNormal;


#if defined(DEBUG)
    uniform bool showOutline;
    const float sLine = 0.008;
    const vec3 pmColor = vec3( 1.0, 0.5, 0.0);
    const vec3 wgs84Color = vec3( 1.0, 0.0, 0.0);
#endif

#if defined(MATTE_ID_MODE) || defined(DEPTH_MODE)
#include <packing>
uniform int  uuid;
#endif

vec4 applyWhiteToInvisibleEffect(vec4 color, float intensity) {
    float a = dot(color.rgb, vec3(0.333333333));
    color.a *= 1.0 - pow(abs(a), intensity);
    return color;
}

vec4 applyLightColorToInvisibleEffect(vec4 color, float intensity) {
    float a = max(0.05,1. - length(color.xyz - 1.));
    color.a *= 1.0 - pow(abs(a), intensity);
    color.rgb *= color.rgb * color.rgb;
    return color;
}

vec3 uvWGS84;
vec3 uvPM;

vec4 getLayerColor(int i, sampler2D texture, vec4 offsetScale, Layer layer) {
    if ( !(i < colorTextureCount) ) return vec4(0);
    vec3 uv = (layer.crs == CRS_PM) ? uvPM : uvWGS84;
    if (i != layer.textureOffset + int(uv.z)) return vec4(0);
    vec4 color = texture2D(texture, pitUV(uv.xy, offsetScale));
    if(color.a > 0.0) {
        if(layer.effect > 2.0) {
            color.rgb /= color.a;
            color = applyLightColorToInvisibleEffect(color, layer.effect);
            color.rgb *= color.a;
        } else if(layer.effect > 0.0) {
            color.rgb /= color.a;
            color = applyWhiteToInvisibleEffect(color, layer.effect);
            color.rgb *= color.a;
        }
    }
    if (showOutline && uv.x > offsetScale.z) {
        color *= offsetScale.z; // to darken according to downscaling
    }
    return color * layer.opacity;
}


void main() {
    #include <logdepthbuf_fragment>

#if defined(MATTE_ID_MODE)

    gl_FragColor = packDepthToRGBA(float(uuid) / (256.0 * 256.0 * 256.0));

#elif defined(DEPTH_MODE)

  #if defined(USE_LOGDEPTHBUF) && defined(USE_LOGDEPTHBUF_EXT)
    float z = gl_FragDepthEXT ;
  #else
    float z = gl_FragCoord.z;
  #endif
    gl_FragColor = packDepthToRGBA(z);

#else

    gl_FragColor.a = opacity;

    // Reconstruct PM uv and PM subtexture id (see TileGeometry)
    uvWGS84 = vec3(vUv_WGS84, 0.);
    uvPM    = vec3(vUv_WGS84.x, fract(vUv_PM), floor(vUv_PM));
    
    #if defined(DEBUG)
    if (showOutline) {
        if (uvWGS84.x < sLine || 1.0 - uvWGS84.x < sLine || uvWGS84.y < sLine || 1.0 - uvWGS84.y < sLine) {
            gl_FragColor.rgb = wgs84Color;
            return;
        } else if (uvPM.x < sLine || 1.0 - uvPM.x < sLine || uvPM.y < sLine || 1.0 - uvPM.y < sLine) {
            gl_FragColor.rgb = pmColor;
            return;
        }
    }
    #endif

    vec4 layerColor;
    vec3 diffuseColor = noTextureColor;
    #pragma unroll_loop
    for ( int i = 0; i < NUM_FS_TEXTURES; i ++ ) {
        layerColor = getLayerColor( i , colorTextures[ i ], colorOffsetScales[ i ], colorLayers[ i ]);
        // layerColor is alpha-premultiplied
        diffuseColor = layerColor.rgb + diffuseColor * (1.0 - layerColor.a);
    }

    // Selected
    if(selected) {
        diffuseColor = mix(selectedColor, diffuseColor, 0.5 );
    }

    // Fog
    #if defined(USE_LOGDEPTHBUF) && defined(USE_LOGDEPTHBUF_EXT)
        float depth = gl_FragDepthEXT / gl_FragCoord.w;
    #else
        float depth = gl_FragCoord.z / gl_FragCoord.w;
    #endif
    float fogIntensity = 1.0/(exp(depth/distanceFog));
    gl_FragColor.rgb = mix(fogColor, diffuseColor.rgb, fogIntensity);

    if(lightingEnabled) {   // Add lighting
        float light = min(2. * dot(vNormal, lightPosition),1.);
        gl_FragColor.rgb *= light;
    }
    #endif
}
