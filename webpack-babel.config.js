var path = require('path');

var commonConfig = require('./webpack-common.config.js');

module.exports = {
    resolve: {
        alias: {
            'three-extras': path.resolve(__dirname, 'node_modules/three/examples/js/'),
        },
    },
    output: {
        libraryTarget: 'commonjs2',
        umdNamedDefine: true,
    },
    module: {
        rules: [
            commonConfig.glslLoader,
            commonConfig.jsonLoader,
        ],
    },
};
