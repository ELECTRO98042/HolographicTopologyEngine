import * as THREE from '/js/vendor/graphics/three.js';

function OrbitControls(object, domElement) {
	if (domElement === undefined) console.warn('THREE.OrbitControls: The second argument "domElement" is now mandatory.');
	if (domElement === document) console.warn('THREE.OrbitControls: "document" is not supported as a domElement anymore. Please use "renderer.domElement".');

	this.object = object;
	this.domElement = domElement;

	// API
	this.enabled = true;
	this.target = new THREE.Vector3();

	this.minDistance = 0;
	this.maxDistance = Infinity;

	this.minZoom = 0;
	this.maxZoom = Infinity;

	this.minPolarAngle = 0;
	this.maxPolarAngle = Math.PI;

	this.minAzimuthAngle = - Infinity;
	this.maxAzimuthAngle = Infinity;

	this.enableDamping = false;
	this.dampingFactor = 0.05;

	this.enableZoom = true;
	this.zoomSpeed = 1.0;

	this.enableRotate = true;
	this.rotateSpeed = 1.0;

	this.enablePan = true;
	this.panSpeed = 1.0;
	this.screenSpacePanning = true;
	this.keyPanSpeed = 7.0;

	this.autoRotate = false;
	this.autoRotateSpeed = 2.0;

	this.enableKeys = true;
	this.keys = { LEFT: 'ArrowLeft', UP: 'ArrowUp', RIGHT: 'ArrowRight', BOTTOM: 'ArrowDown' };
	this.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
	this.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

	// Internals
	var scope = this;
	var STATE = { NONE: - 1, ROTATE: 0, DOLLY: 1, PAN: 2, TOUCH_ROTATE: 3, TOUCH_PAN: 4, TOUCH_DOLLY_PAN: 5 };
	var state = STATE.NONE;

	var EPS = 0.000001;
	var rotateStart = new THREE.Vector2();
	var rotateEnd = new THREE.Vector2();
	var rotateDelta = new THREE.Vector2();

	var panStart = new THREE.Vector2();
	var panEnd = new THREE.Vector2();
	var panDelta = new THREE.Vector2();

	var dollyStart = new THREE.Vector2();
	var dollyEnd = new THREE.Vector2();
	var dollyDelta = new THREE.Vector2();

	var spherical = new THREE.Spherical();
	var sphericalDelta = new THREE.Spherical();

	var scale = 1;
	var panOffset = new THREE.Vector3();
	var zoomChanged = false;

	var v = new THREE.Vector3();

	function getAutoRotationAngle() {
		return 2 * Math.PI / 60 / 60 * scope.autoRotateSpeed;
	}

	function getZoomScale() {
		return Math.pow(0.95, scope.zoomSpeed);
	}

	function rotateLeft(angle) {
		sphericalDelta.theta -= angle;
	}

	function rotateUp(angle) {
		sphericalDelta.phi -= angle;
	}

	var panLeft = function (distance, objectMatrix) {
		v.setFromMatrixColumn(objectMatrix, 0);
		v.multiplyScalar(- distance);
		panOffset.add(v);
	};

	var panUp = function (distance, objectMatrix) {
		if (scope.screenSpacePanning === true) {
			v.setFromMatrixColumn(objectMatrix, 1);
		} else {
			v.set(0, 1, 0);
		}
		v.multiplyScalar(distance);
		panOffset.add(v);
	};

	var pan = function (deltaX, deltaY) {
		var element = scope.domElement;
		if (scope.object instanceof THREE.PerspectiveCamera) {
			var position = scope.object.position;
			offset.copy(position).sub(scope.target);
			var targetDistance = offset.length();
			targetDistance *= Math.tan((scope.object.fov / 2) * Math.PI / 180.0);
			panLeft(2 * deltaX * targetDistance / element.clientHeight, scope.object.matrix);
			panUp(2 * deltaY * targetDistance / element.clientHeight, scope.object.matrix);
		} else if (scope.object instanceof THREE.OrthographicCamera) {
			panLeft(deltaX * (scope.object.right - scope.object.left) / element.clientWidth, scope.object.matrix);
			panUp(deltaY * (scope.object.top - scope.object.bottom) / element.clientHeight, scope.object.matrix);
		} else {
			scope.enablePan = false;
		}
	};

	function dollyIn(dollyScale) {
		if (scope.object instanceof THREE.PerspectiveCamera) {
			scale /= dollyScale;
		} else if (scope.object instanceof THREE.OrthographicCamera) {
			scope.object.zoom = Math.max(scope.minZoom, Math.min(scope.maxZoom, scope.object.zoom * dollyScale));
			scope.object.updateProjectionMatrix();
			zoomChanged = true;
		}
	}

	function dollyOut(dollyScale) {
		if (scope.object instanceof THREE.PerspectiveCamera) {
			scale *= dollyScale;
		} else if (scope.object instanceof THREE.OrthographicCamera) {
			scope.object.zoom = Math.max(scope.minZoom, Math.min(scope.maxZoom, scope.object.zoom / dollyScale));
			scope.object.updateProjectionMatrix();
			zoomChanged = true;
		}
	}

	function onMouseDown(event) {
		if (scope.enabled === false) return;
		event.preventDefault();

		if (event.button === 0) {
			if (scope.enableRotate === false) return;
			rotateStart.set(event.clientX, event.clientY);
			state = STATE.ROTATE;
		} else if (event.button === 1) {
			if (scope.enableZoom === false) return;
			dollyStart.set(event.clientX, event.clientY);
			state = STATE.DOLLY;
		} else if (event.button === 2) {
			if (scope.enablePan === false) return;
			panStart.set(event.clientX, event.clientY);
			state = STATE.PAN;
		}

		if (state !== STATE.NONE) {
			window.addEventListener('mousemove', onMouseMove, false);
			window.addEventListener('mouseup', onMouseUp, false);
		}
	}

	function onMouseMove(event) {
		if (scope.enabled === false) return;
		event.preventDefault();

		var element = scope.domElement;

		if (state === STATE.ROTATE) {
			if (scope.enableRotate === false) return;
			rotateEnd.set(event.clientX, event.clientY);
			rotateDelta.subVectors(rotateEnd, rotateStart);
			rotateLeft(2 * Math.PI * rotateDelta.x / element.clientHeight * scope.rotateSpeed);
			rotateUp(2 * Math.PI * rotateDelta.y / element.clientHeight * scope.rotateSpeed);
			rotateStart.copy(rotateEnd);
			scope.update();
		} else if (state === STATE.DOLLY) {
			if (scope.enableZoom === false) return;
			dollyEnd.set(event.clientX, event.clientY);
			dollyDelta.subVectors(dollyEnd, dollyStart);
			if (dollyDelta.y > 0) {
				dollyIn(getZoomScale());
			} else if (dollyDelta.y < 0) {
				dollyOut(getZoomScale());
			}
			dollyStart.copy(dollyEnd);
			scope.update();
		} else if (state === STATE.PAN) {
			if (scope.enablePan === false) return;
			panEnd.set(event.clientX, event.clientY);
			panDelta.subVectors(panEnd, panStart);
			pan(panDelta.x, panDelta.y);
			panStart.copy(panEnd);
			scope.update();
		}
	}

	function onMouseUp() {
		window.removeEventListener('mousemove', onMouseMove, false);
		window.removeEventListener('mouseup', onMouseUp, false);
		state = STATE.NONE;
	}

	function onMouseWheel(event) {
		if (scope.enabled === false || scope.enableZoom === false || (state !== STATE.NONE && state !== STATE.ROTATE)) return;
		event.preventDefault();
		event.stopPropagation();

		if (event.deltaY < 0) {
			dollyOut(getZoomScale());
		} else if (event.deltaY > 0) {
			dollyIn(getZoomScale());
		}
		scope.update();
	}

	var offset = new THREE.Vector3();
	var quat = new THREE.Quaternion().setFromUnitVectors(scope.object.up, new THREE.Vector3(0, 1, 0));
	var quatInverse = quat.clone().invert ? quat.clone().invert() : quat.clone().inverse();
	var lastPosition = new THREE.Vector3();
	var lastQuaternion = new THREE.Quaternion();

	this.update = function () {
		var position = scope.object.position;
		offset.copy(position).sub(scope.target);
		offset.applyQuaternion(quat);
		spherical.setFromVector3(offset);

		if (scope.autoRotate && state === STATE.NONE) {
			rotateLeft(getAutoRotationAngle());
		}

		spherical.theta += sphericalDelta.theta;
		spherical.phi += sphericalDelta.phi;
		spherical.theta = Math.max(scope.minAzimuthAngle, Math.min(scope.maxAzimuthAngle, spherical.theta));
		spherical.phi = Math.max(scope.minPolarAngle, Math.min(scope.maxPolarAngle, spherical.phi));
		spherical.makeSafe();
		spherical.radius *= scale;
		spherical.radius = Math.max(scope.minDistance, Math.min(scope.maxDistance, spherical.radius));

		scope.target.add(panOffset);
		offset.setFromSpherical(spherical);
		offset.applyQuaternion(quatInverse);
		position.copy(scope.target).add(offset);
		scope.object.lookAt(scope.target);

		if (scope.enableDamping === true) {
			sphericalDelta.theta *= (1 - scope.dampingFactor);
			sphericalDelta.phi *= (1 - scope.dampingFactor);
			panOffset.multiplyScalar(1 - scope.dampingFactor);
		} else {
			sphericalDelta.set(0, 0, 0);
			panOffset.set(0, 0, 0);
		}

		scale = 1;

		if (zoomChanged || lastPosition.distanceToSquared(scope.object.position) > EPS || 8 * (1 - lastQuaternion.dot(scope.object.quaternion)) > EPS) {
			lastPosition.copy(scope.object.position);
			lastQuaternion.copy(scope.object.quaternion);
			zoomChanged = false;
			return true;
		}
		return false;
	};

	this.domElement.addEventListener('contextmenu', function (event) { event.preventDefault(); }, false);
	this.domElement.addEventListener('mousedown', onMouseDown, false);
	this.domElement.addEventListener('wheel', onMouseWheel, { passive: false });
}
export { OrbitControls };