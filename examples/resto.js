// Instanciate iTowns GlobeView
var viewerDiv = document.getElementById('viewerDiv');
var positionOnGlobe = { longitude: 4.818, latitude: 45.7354, altitude: 30000000 };
var view = new itowns.GlobeView(viewerDiv, positionOnGlobe);

// Add imagery and elevation layers
var promises = [];
function addLayerCb(layer) { return view.addLayer(layer); }
promises.push(itowns.Fetcher.json('./layers/JSONLayers/Ortho.json').then(addLayerCb));
promises.push(itowns.Fetcher.json('./layers/JSONLayers/WORLD_DTM.json').then(addLayerCb));

function resto_add(url, layer) {
    layer = layer || {}
    var THREE = itowns.THREE;
    layer.crsOut = layer.crsOut || view.referenceCrs;
    layer.parse = layer.parse || itowns.GeoJSON2Features.parse;
    layer.convert = layer.convert || itowns.Feature2Mesh.convert({
        altitude: layer.altitude || 40000, 
        type: layer.type, // force geojson type (eg: 'linestring')
    });
    function resto_add_features(json) {
        // handle links and paging of results
        var last_page;
        for (const i in json.properties.links) {
            const link = json.properties.links[i];
            if (link.rel === "next" && layer.followLinks)
                itowns.Fetcher.json(link.href).then(resto_add_features);
            if (link.rel === "last")
                last_page = parseInt(link.href.split('=').pop());
        }

        // parse the geojson into itowns features
		var features = layer.parse(layer.crsOut, json, layer.extent, { crsExtent:'in', filter: layer.filter });
        if(!features) return;
    
        // convert the itowns features into a THREE.js Object3D (eg: Mesh, LineSegments, Group...)
        var group = layer.convert(features);
        if(!group) return;
        
        
		group.children.forEach(child => {
            // compute uvs and update material
			child.material.transparent = true;
			child.material.opacity = 0.5;
            position = child.geometry.getAttribute("position").array;
            ids = child.geometry.getAttribute("id");
            colors = child.geometry.getAttribute("color").array;
            if(!ids) return;
            ids = ids.array;
            uvs = new Float32Array(ids.length * 2);
            for(var i=0; i<ids.length; ++i)
            {
                const extent = child.geometry.extent[ids[i]];
                const coords = new itowns.Coordinates(layer.crsOut, position[3*i  ], position[3*i+1], position[3*i+2]).as(extent._crs);
                var offset = coords.offsetInExtent(extent);
                uvs[2*i  ] = offset.x;
                uvs[2*i+1] = offset.y;
                colors[3*i  ] = 255;
                colors[3*i+1] = 255;
                colors[3*i+2] = 255;
            }
            child.geometry.addAttribute('uv', new THREE.BufferAttribute(uvs, 2));
            child.material.needsUpdate = true;
            child.material.side = THREE.DoubleSide;
		});

        group.features.forEach(feature => {
            // fetch thumbnail texture and update material
			var thumbnail = feature.properties.thumbnail;
            if (!thumbnail) return
            
            const { texture, promise } = itowns.Fetcher.texture(thumbnail, layer.networkOptions);
			texture.generateMipmaps = false;
			texture.magFilter = THREE.LinearFilter;
			texture.minFilter = THREE.LinearFilter;
			texture.flipY = false;
			texture.anisotropy = 16;
            promise.catch(console.warn).then(function() {
                group.children.forEach(child => {
                    //id = child.geometry.getAttribute("id").array;
                    //console.log(texture, feature.properties._idx)
                    child.material.map = texture; 
                    child.material.needsUpdate = true;
                    view.notifyChange(true);
                });
            })
		});
        
        // add group to the view
        view.scene.add(group);
        view.notifyChange(true);
    };

    itowns.Fetcher.json(url+'collections.json', layer.networkOptions).then(json => {
        // filtered collections
        var collections = json.collections;
        if(layer.collections) collections = collections.filter(c => layer.collections.indexOf(c.name) !== -1 );
        // query each collection
        return collections.map(c => itowns.Fetcher.json(url+'api/collections/'+c.name+'/search.json').then(resto_add_features));
    });
}

// Listen for globe full initialisation event
view.addEventListener(itowns.GLOBE_VIEW_EVENTS.GLOBE_INITIALIZED, function () {
    console.info('Globe initialized');
    
    resto_add("https://finder.eocloud.eu/resto/", {collections: ["Sentinel1", "Sentinel2"], followLinks: true, networkOptions: {crossOrigin:"anonymous"}});
    
    //project-cached json and thumbnails mimicking a resto instance
    //resto_add("resto/", {collections: ["SENTINEL2"]});
    
    // Some other resto instances, however they yield CORS errors
    //resto_add("https://theia.cnes.fr/atdistrib/resto2/", {collections: ["SENTINEL2"]});
    //resto_add("https://peps.cnes.fr/resto/");
    
    Promise.all(promises).then(function () {});
});
