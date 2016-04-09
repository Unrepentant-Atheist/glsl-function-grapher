/* global THREE */
import World from './world/world';
import Box from './entity/box';

class FunctionGrapher {
    constructor() {
        this.world = new World('raytracer', { element: '#grapher' });

        $('#grapher').append(this.world.panel);
        this.world.setSize();


        this.variables = {};

        this.vShader =
            'varying vec4 vPosition;\n' +
            'varying vec3 vNormal;\n' +
            'void main() {\n' +
                'vPosition = modelMatrix * vec4(position, 1.0);\n' +
                'vNormal = normal;\n' +
                'gl_Position = ' +
                    'projectionMatrix * modelViewMatrix * vec4( position, 1.0 );\n' +
            '}';


        this.fn = '' +
                '81.*(x*x*x + y*y*y + z*z*z) - ' +
                    '189.*(x*x*y + x*x*z + y*y*x + y*y*z+ z*z*x + z*z*y) + ' +
                    '54.*(x*y*z) + 126.*(x*y+x*z+y*z) - 9.*(x*x+y*y+z*z) - 9.*(x+y+z) + 1.';

        this.fShader = this.makeFragmentShader(this.fn);

        this.uniforms = {};

        this.uniforms.lightsource = { type: 'v3', value: new THREE.Vector3(10, 10, -30) };
        // Stepsize for sampling... 1 seems a good compromise between real-time shading and quality
        // on my MBP
        this.uniforms.stepsize = { type: 'f', value: 0.01 };
        this.uniforms.opacity = { type: 'f', value: 0.5 };
        this.uniforms.surface = { type: 'f', value: 0.0 };

        this.uniforms.xBounds = { type: 'v2', value: new THREE.Vector2(-1, 1) };
        this.uniforms.yBounds = { type: 'v2', value: new THREE.Vector2(-1, 1) };
        this.uniforms.zBounds = { type: 'v2', value: new THREE.Vector2(-1, 1) };

        this.material = new THREE.ShaderMaterial({
            uniforms:       this.uniforms,
            vertexShader:   this.vShader,
            fragmentShader: this.fShader,
            side:           THREE.DoubleSide,
            shading:        THREE.SmoothShading,
        });

        this.customVarIDs = [];

        this.box = new Box('plot', [2, 2, 2], { material: this.material });

        this.world.addEntity(this.box);


        this.world.go();

        $(window).resize(() => this.world.setSize());
    }

    makeVariable(name, defaultValue, eqnHTML) {
        const scope = this;

        eqnHTML.eqn += '<div id="'+name+'" class="equation">'+ defaultValue+'</div>';

        this.variables[name] = {
            'value': Number(defaultValue),
            'defaultValue': Number(defaultValue),
            'dragged': false,
            'mdX': 0,
            'mdVal': Number(defaultValue),
        };

        function ret() {
            var inputdiv = $('#'+name);

            function start(evt) {
                evt.preventDefault();
                var inputdiv = $('#'+name);
                scope.variables[name].dragged = true;
                scope.variables[name].mdX = evt.pageX;
                scope.variables[name].mdVal = Number(scope.variables[name].value);
            }

            function touchstart(evt) {
                evt.preventDefault();
                var inputdiv = $('#'+name);
                scope.variables[name].dragged = true;
                scope.variables[name].mdX = evt.originalEvent.touches[0].pageX;;
                scope.variables[name].mdVal = Number(scope.variables[name].value);
            }

            inputdiv.on('mousedown', start);
            inputdiv.on('touchstart', touchstart);
        }

        function update(evt) {
            var inputdiv = $('#'+name);

            if (scope.variables[name].dragged) {
                evt.preventDefault();
                var diff = evt.pageX - scope.variables[name].mdX;
                scope.variables[name].value = scope.variables[name].mdVal + diff;

                inputdiv.html(scope.variables[name].value);

                scope.uniforms[name].value = Number(scope.variables[name].value);
            }
        }

        function touchupdate(evt) {
            var inputdiv = $('#'+name);

            if (scope.variables[name].dragged) {
                evt.preventDefault();
                var diff = evt.originalEvent.touches[0].pageX - scope.variables[name].mdX;
                scope.variables[name].value = scope.variables[name].mdVal + diff;

                inputdiv.html(scope.variables[name].value);

                scope.uniforms[name].value = Number(scope.variables[name].value);
            }
        }

        $(document).on('mousemove', update);
        $(document).on('touchmove', touchupdate);

        function end(evt) {
            var inputdiv = $('#'+name);
    //        evt.preventDefault();
            scope.variables[name].dragged = false;
        }

        $(document).on('mouseup', end);
        $(document).on('touchend', end);

        return ret;
    }

};

FunctionGrapher.prototype.findVariables = function(fn) {

    var retFn = fn; // copy str.

//    var reg = /\{\{(\w+):(\d+):(\d+):(\d+)\}\}/g;

    var reg = /-?(?:\d+\.?\d*|\d*\.\d+)/g;

    var varPart = reg.exec(fn);

    var last = reg.lastIndex;

    var extraUniforms = '';

    for (var i = 0; i < this.customVarIDs.length; i++) {
        $(this.customVarIDs[i]).remove();
    }

    var eqnHTML = {eqn: '0='};

    var idx;
    if (varPart === null) { idx = fn.length; } else { idx = varPart.index; }

    eqnHTML.eqn += fn.substring(0, idx);

    this.customVarIDs = [];

    var count = 0;

    var callbacks = [];

    while (varPart !== null) {

        var name = 'var'+String.fromCharCode(97 + count);
        retFn = retFn.replace(varPart[0], name);

        this.uniforms[name] = {type: 'f', value: varPart[0]};
        extraUniforms += 'uniform float ' + name + ';\n';

        callbacks.push(this.makeVariable(name, varPart[0], eqnHTML));

        this.customVarIDs.push('#'+name);

        var last = reg.lastIndex;

        var varPart = reg.exec(fn);

        if (varPart === null) { idx = fn.length; } else { idx = varPart.index; }
        eqnHTML.eqn += fn.substring(last, idx);

        count++;
    }

    $('#fndisplay')[0].innerHTML = eqnHTML.eqn;

    for (var i = 0; i < callbacks.length; i++) {
        callbacks[i]();
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
    var boxnew = new Box('plot', [x.y - x.x, y.y - y.x, z.y - z.x], {material: this.material});

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

export default FunctionGrapher;
