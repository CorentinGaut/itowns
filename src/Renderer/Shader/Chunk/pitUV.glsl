vec2 pitUV(vec2 uvIn, vec4 pit)
{
    vec2  uv = uvIn * pit.zw;
    uv.x += pit.x;
    uv.y += 1.0 - pit.w - pit.y;

    return uv;
}

