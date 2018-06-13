
uniform sampler2D   dTextures_00[1];
uniform vec3        offsetScale_L00[1];
uniform int         elevationTextureCount;

#define displacementMap         (dTextures_00[0])
#define displacementOffsetScale (offsetScale_L00[0])
#define displacementScale       (1.)
#define displacementBias        (0.)

highp float decode32(highp vec4 rgba) {
    highp float Sign = 1.0 - step(128.0,rgba[0])*2.0;
    highp float Exponent = 2.0 * mod(rgba[0],128.0) + step(128.0,rgba[1]) - 127.0;
    highp float Mantissa = mod(rgba[1],128.0)*65536.0 + rgba[2]*256.0 +rgba[3] + float(0x800000);
    highp float Result =  Sign * exp2(Exponent) * (Mantissa * exp2(-23.0 ));
    return Result;
}
