#if NUM_VS_TEXTURES > 0
    if(elevationTextureCount > 0) {
        uv = uv * displacementOffsetScale.zw + displacementOffsetScale.xy;

        #if defined(RGBA_TEXTURE_ELEVATION)
            vec4 rgba = texture2D( displacementMap, uv ) * 255.0;

            rgba.rgba = rgba.abgr;

            float dv = max(decode32(rgba),0.0);

            // TODO In RGBA elevation texture LinearFilter give some errors with nodata value.
            // need to rewrite sample function in shader
            // simple solution
            if(dv>5000.0) {
                dv = 0.0;
            }

        #elif defined(DATA_TEXTURE_ELEVATION)
            float   dv  = max(texture2D( displacementMap, uv ).w, 0.);
        #elif defined(COLOR_TEXTURE_ELEVATION)
            float   dv  = max(texture2D( displacementMap, uv ).r, 0.);
            dv = _minElevation + dv * (_maxElevation - _minElevation);
        #else
        #error Must define either RGBA_TEXTURE_ELEVATION, DATA_TEXTURE_ELEVATION or COLOR_TEXTURE_ELEVATION
        #endif

        transformed += normal * ( dv * displacementScale + displacementBias );
    }
#endif
