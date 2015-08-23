

var $     = require('jquery');
var World = require('./world/world');
var Box   = require('./entity/box');

var FunctionGrapher = function() {

    this.init();

    $('#grapher').append(this.world.panel);
    this.world.setSize();

};

FunctionGrapher.prototype.constructor = FunctionGrapher;

FunctionGrapher.prototype.init = function() {

    this.world = new World('raytracer', {element: '#grapher'});

    var vShader = 
        'varying vec4 vPosition;\n'+
        'varying vec3 vNormal;\n'+
        'void main() {\n' +
            'vPosition = modelMatrix * vec4(position, 1.0);\n' +
            'vNormal = normal;\n' +
            'gl_Position = ' +
                'projectionMatrix * modelViewMatrix * vec4( position, 1.0 );\n' +
        '}';


    var fn = '' + 
            '81.*(x*x*x + y*y*y + z*z*z) - '+ 
                '189.*(x*x*y + x*x*z + y*y*x + y*y*z+ z*z*x + z*z*y) + '+
                '54.*(x*y*z) + 126.*(x*y+x*z+y*z) - 9.*(x*x+y*y+z*z) - 9.*(x+y+z) + 1.';

    var fShader = this.makeFragmentShader(fn);

    this.uniforms = {};

    this.uniforms['lightsource'] = {type: 'v3', value: new THREE.Vector3(10, 10, -30)};
    // Stepsize for sampling... 1 seems a good compromise between real-time shading and quality
    // on my MBP
    this.uniforms['stepsize'] = {type: 'f', value: .01};
    this.uniforms['opacity'] = {type: 'f', value: 0.5};
    this.uniforms['surface'] = {type: 'f', value: 0.};

    this.uniforms['xBounds'] = {type: 'v2', value: new THREE.Vector2(-1, 1)};
    this.uniforms['yBounds'] = {type: 'v2', value: new THREE.Vector2(-1, 1)};
    this.uniforms['zBounds'] = {type: 'v2', value: new THREE.Vector2(-1, 1)};

    var material = new THREE.ShaderMaterial( { 
        uniforms: this.uniforms, 
        vertexShader: vShader, 
        fragmentShader: fShader,
        side: THREE.DoubleSide,
        shading: THREE.SmoothShading,
    });


    this.box = new Box('plot', [2,2,2], {material: material});
    //var box = new Box('plot', [2,2,2] );

    this.world.addEntity(this.box);


    this.world.go();

    $(window).resize(function() {
        this.world.setSize();
    }.bind(this));
};

FunctionGrapher.prototype.makeVariable = function(variable) {

    var vardiv = $('<div id="'+variable[1]+'">').append('<label>').text(variable[1]).append('<input id="'+variable[1]+'_input" type="number" value="'+variable[4]+'">');

    $('#controls').append(vardiv);

    $('#'+variable[1]+'_input').change((function(uni) { return function() { uni.value = this.value; }; })(this.uniforms[variable[1]]));

};

FunctionGrapher.prototype.findVariables = function(fn) {

    var retFn = fn; // copy str.

    var reg = /\{\{(\w+):(\d+):(\d+):(\d+)\}\}/g;
    var varPart = reg.exec(fn);
    var extraUniforms = '';

    for (var id in this.customVarIDs) {
        $(id).remove();
    }

    this.customVarIDs = [];

    while (varPart !== null) {

        retFn = retFn.replace(varPart[0], varPart[1]);

        this.uniforms[varPart[1]] = {type: 'f', value: varPart[4]};
        extraUniforms += 'uniform float ' + varPart[1] + ';\n';

        this.makeVariable(varPart);

        this.customVarIDs.push('#'+varPart[1]);

        var varPart = reg.exec(fn);
    }

    return {retFn: retFn, extraUniforms: extraUniforms};

}

FunctionGrapher.prototype.updateShader = function(fn) {
    var ret = this.findVariables(fn);
    var fragShader = this.makeFragmentShader(ret.retFn, ret.extraUniforms);
    this.box.opts.material.fragmentShader = fragShader;
    this.box.opts.material.needsUpdate = true;
}

FunctionGrapher.prototype.setOpacity = function(val) {
    this.uniforms['opacity'].value = val;
}

FunctionGrapher.prototype.updateBounds = function(val) {

    this.world.removeEntity(this.box);

    for (var entry in val) {
        for (var coord in val[entry]) {
            this.uniforms[entry].value[coord] = Number(val[entry][coord]);
        }
    }
    var x = this.uniforms['xBounds'].value; 
    var y = this.uniforms['yBounds'].value;
    var z = this.uniforms['zBounds'].value;
    var boxnew = new Box('plot', [x.y - x.x, y.y - y.x, z.y - z.x], {material: material});

    var step = (Math.max(Math.max(x.y - x.x, y.y - y.x), z.y - z.x))/100;
    this.uniforms['stepsize'].value = step;


    boxnew.mesh.position.x = (x.x + x.y)/2.
    boxnew.mesh.position.y = (y.x + y.y)/2.
    boxnew.mesh.position.z = (z.x + z.y)/2.


    boxnew.mesh.updateMatrix();
    
    this.world.addEntity(boxnew);

    this.box = boxnew;
};

FunctionGrapher.prototype.makeFragmentShader = function(fn, extraUniforms) {

    extraUniforms = (extraUniforms === undefined) ? '' : extraUniforms;

    var fShader = '' +
        'varying vec4 vPosition;\n'+
        'uniform vec3 lightsource;\n'+
        'uniform float stepsize;\n'+
        'uniform float opacity;\n'+
        'uniform float surface;\n'+
        'uniform vec2 xBounds;\n'+
        'uniform vec2 yBounds;\n'+
        'uniform vec2 zBounds;\n'+
        extraUniforms +
        // Describe ROI as a sphere later?

        'float fn(float x, float y, float z) {\n' +
            'return ' + 
            fn + ';\n' +
        '}\n'+

        'vec3 ptToColor(vec3 pt) {\n'+
            'return vec3(1.,1.,1.)*(pt.xyz/vec3( xBounds.y - xBounds.x, yBounds.y - yBounds.x, zBounds.y - zBounds.x) + .5);\n'+
        '}\n' +

        'void main() {' + 
            'vec3 ro = cameraPosition;\n'+
            'vec3 dir = vPosition.xyz - ro;\n'+
            'float t_entry = length(dir);\n'+
            'vec3 rd = normalize(dir);\n'+

            'if (t_entry < 0.) { gl_FragColor = vec4(0.,0.,0.,1.); return; }\n'+

            'vec3 pt = ro+rd*t_entry;\n'+

            'vec3 rskip = normalize(rd)*stepsize;\n'+

            'vec3 I = vec3(0.,0.,0.);\n'+
            'int intersects = 0;\n'+

            'float last = 0.0;'+
            'vec3 tols = vec3((xBounds.y - xBounds.x)*.01, (yBounds.y - yBounds.x)*.01, (zBounds.y - zBounds.x)*.01);\n'+ 
            'for (int i = 0; i < 1000; i++) {\n'+
                // outside roi case.
                'if (pt.z < zBounds.x-tols.z || pt.z > zBounds.y+tols.z || pt.x < xBounds.x-tols.x || pt.x > xBounds.y+tols.x || pt.y > yBounds.y+tols.y || pt.y < yBounds.x-tols.y) { break; }\n'+
                // plot outline
                'if (    (pt.z > zBounds.y-1.*tols.z && pt.y > yBounds.y-1.*tols.y) ||\n'+
                        '(pt.z > zBounds.y-1.*tols.z && pt.y < yBounds.x+1.*tols.y) ||\n'+
                        '(pt.z > zBounds.y-1.*tols.z && pt.x > xBounds.y-1.*tols.x) ||\n'+
                        '(pt.z > zBounds.y-1.*tols.z && pt.x < xBounds.x+1.*tols.x) ||\n'+

                        '(pt.z < zBounds.x+1.*tols.z && pt.y > yBounds.y-1.*tols.y) ||\n'+
                        '(pt.z < zBounds.x+1.*tols.z && pt.y < yBounds.x+1.*tols.y) ||\n'+
                        '(pt.z < zBounds.x+1.*tols.z && pt.x > xBounds.y-1.*tols.x) ||\n'+
                        '(pt.z < zBounds.x+1.*tols.z && pt.x < xBounds.x+1.*tols.x) ||\n'+

                        '(pt.x < xBounds.x+1.*tols.x && pt.y > yBounds.y-1.*tols.y) ||\n'+
                        '(pt.x < xBounds.x+1.*tols.x && pt.y < yBounds.x+1.*tols.y) ||\n'+
                        '(pt.x > xBounds.y-1.*tols.x && pt.y > yBounds.y-1.*tols.y) ||\n'+
                        '(pt.x > xBounds.y-1.*tols.x && pt.y < yBounds.x+1.*tols.y)\n'+
                        ') { \n'+
                    'gl_FragColor = vec4(0.,0.,0.,1.); return;\n'+
                '}\n'+
                'float curr = 0.;\n'+
                'curr = fn(pt.x, pt.y, pt.z);\n'+

                'if (last*curr < 0.) {\n'+
                    'vec3 grad = vec3(0.,0.,0.);\n'+

                     // Gradient-less coloring?
                    'if (opacity >= 1.) {\n'+
                        'gl_FragColor = vec4(ptToColor(pt.xyz), 1.);\n'+
                        'return;\n'+
                    '} else {\n'+
                        'I += vec3(1.,1.,1.)*(pt.xyz/2.+.5);\n'+
                        'intersects++;\n'+
                    '}\n'+
                        
                '}\n'+
                'last = curr;\n'+
                'pt = pt + rskip;\n'+
            '}\n'+

            'if ( opacity < 1.) {\n'+
                'if (I == vec3(0.,0.,0.)) { gl_FragColor = vec4(1.,1.,1.,1.); return; }\n'+
                'gl_FragColor = vec4((I/float(intersects)),1.);\n'+ 
                'return;\n'+
            '}\n'+
            'gl_FragColor = vec4(1.,1.,1.,1.);\n'+

        '}';
    return fShader;

}

window.FunctionGrapher = FunctionGrapher;

