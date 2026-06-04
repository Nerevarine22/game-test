'use client';

// Raw source from https://github.com/rgliever/ArcheryCanvasGame (Ryan Gliever, 2015)
// Served as a self-contained iframe so the vanilla canvas code runs without
// any interference from Next.js or React.

const ARROW_JS = `
// array of all arrows
var arrows = [];

// adjusts arrow speed
var speedMod = 4;

var addArrow = function() {
  arrows.unshift(new Arrow());
  currArrow = arrows[0];
}

function Arrow() {
  this.x = shootingCirc.x;
  this.y = shootingCirc.y;
  this.arrowTipCoords = { x: this.x+20, y: this.y };
  this.leftTipCoords  = { x: this.x+17, y: this.y-3 };
  this.rightTipCoords = { x: this.x+17, y: this.y+3 };
  this.velX = 0;
  this.velY = 0;
  this.speed = 0;
  this.firing = false;
}
Arrow.prototype.fireArrow = function() {
  if (mousePos && !this.firing) {
    this.speed = Math.min(shootingCirc.r,
                 distBetween(shootingCirc, mousePos)) / speedMod;
    this.velX = Math.cos(angleBetween(mousePos, shootingCirc))*this.speed;
    this.velY = Math.sin(angleBetween(mousePos, shootingCirc))*this.speed;
    this.firing = true;
    addArrow();
  }
};
Arrow.prototype.calcTrajectory = function() {
  if (this.y <= groundPoint && this.firing) {
    this.velY += gravity;
    this.x += this.velX;
    this.y += this.velY;
  } else {
    this.velX = 0;
    this.velY = 0;
    this.firing = false;
  }
};
Arrow.prototype.calcArrowHead = function() {
  if (this.firing) {
    var angle = Math.atan2(this.velX, this.velY);
  } else if (mousePos && this == currArrow) {
    var angle = Math.PI/2 - angleBetween(mousePos, shootingCirc);
  } else return;

  this.arrowTipCoords.x = this.x + 20*Math.sin(angle);
  this.arrowTipCoords.y = this.y + 20*Math.cos(angle);
  var arrowTip = { x: this.arrowTipCoords.x, y: this.arrowTipCoords.y };

  this.leftTipCoords.x  = arrowTip.x - 3*Math.sin(angle - Math.PI/4);
  this.leftTipCoords.y  = arrowTip.y - 3*Math.cos(angle - Math.PI/4);
  this.rightTipCoords.x = arrowTip.x - 3*Math.sin(angle + Math.PI/4);
  this.rightTipCoords.y = arrowTip.y - 3*Math.cos(angle + Math.PI/4);
};
Arrow.prototype.drawArrow = function() {
  this.calcTrajectory();
  this.calcArrowHead();
  var arrowTip  = this.arrowTipCoords;
  var leftTip   = this.leftTipCoords;
  var rightTip  = this.rightTipCoords;

  ctx.beginPath();
  ctx.moveTo(this.x, this.y);
  ctx.lineTo(arrowTip.x, arrowTip.y);
  ctx.moveTo(arrowTip.x, arrowTip.y);
  ctx.lineTo(leftTip.x, leftTip.y);
  ctx.moveTo(arrowTip.x, arrowTip.y);
  ctx.lineTo(rightTip.x, rightTip.y);
  ctx.strokeStyle = 'black';
  ctx.stroke();
};
`;

const ARCHERY_JS = `
var canvas = document.createElement('canvas');
canvas.id = 'canvas';
var ctx = canvas.getContext('2d');
canvas.width  = window.innerWidth;
canvas.height = window.innerHeight;
document.body.appendChild(canvas);
var cWidth  = canvas.width;
var cHeight = canvas.height;

var gravity    = 0.4;
var groundPoint = cHeight - (cHeight / 4);

var drawnBack  = false;
var firedArrow = false;

var distBetween = function(p1, p2) {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
};

var isInCircle = function(mousePos) {
  return distBetween(drawBackCirc, mousePos) < drawBackCirc.r;
};

function getMousePos(canvas, evt) {
  var rect = canvas.getBoundingClientRect();
  var clientX = evt.clientX !== undefined ? evt.clientX : evt.touches[0].clientX;
  var clientY = evt.clientY !== undefined ? evt.clientY : evt.touches[0].clientY;
  return { x: clientX - rect.left, y: clientY - rect.top };
}

var mousePos;
var mouseDown = false;
var mouseUp   = false;

addEventListener('mousemove',  function(e) { mousePos = getMousePos(canvas, e); }, false);
addEventListener('mousedown',  function(e) { mousePos = getMousePos(canvas, e); mouseDown = true;  mouseUp   = false; }, false);
addEventListener('mouseup',    function(e) { mousePos = getMousePos(canvas, e); mouseUp   = true;  mouseDown = false; }, false);
addEventListener('touchstart', function(e) { e.preventDefault(); mousePos = getMousePos(canvas, e); mouseDown = true;  mouseUp   = false; }, { passive: false });
addEventListener('touchmove',  function(e) { e.preventDefault(); mousePos = getMousePos(canvas, e); }, { passive: false });
addEventListener('touchend',   function(e) { e.preventDefault(); mouseUp  = true; mouseDown = false; }, { passive: false });

var drawScene = function() {
  var ground = groundPoint + 15;
  ctx.fillStyle = 'rgba(0,0,200,0.2)';
  ctx.fillRect(0, 0, cWidth, ground);
  ctx.beginPath();
  ctx.moveTo(0, ground);
  ctx.lineTo(cWidth, ground);
  ctx.strokeStyle = 'rgba(0,100,50,0.6)';
  ctx.stroke();
  ctx.fillStyle = 'rgba(0,200,100,0.6)';
  ctx.fillRect(0, ground, cWidth, cHeight);
};

var angleBetween = function(p1, p2) {
  return Math.atan2(p2.y - p1.y, p2.x - p1.x);
};

var shootingCirc = { x: 200, y: groundPoint - 200, r: 75 };
var drawBackCirc = { x: shootingCirc.x, y: shootingCirc.y, r: 10 };

var getAimCoords = function(mousePos) {
  var angle    = Math.PI/2 - angleBetween(mousePos, shootingCirc);
  var distance = Math.min(distBetween(shootingCirc, mousePos), shootingCirc.r);
  return { x: shootingCirc.x + distance*Math.sin(angle),
           y: shootingCirc.y + distance*Math.cos(angle) };
};
var drawAimer = function() {
  if (drawnBack) {
    var aimCoords = getAimCoords(mousePos);
    ctx.beginPath();
    ctx.moveTo(aimCoords.x, aimCoords.y);
    ctx.lineTo(shootingCirc.x, shootingCirc.y);
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.stroke();
  }
};
var drawCircles = function() {
  ctx.beginPath();
  ctx.arc(shootingCirc.x, shootingCirc.y, shootingCirc.r, 0, 2*Math.PI);
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(drawBackCirc.x, drawBackCirc.y, drawBackCirc.r, 0, 2*Math.PI);
  ctx.stroke();
  drawAimer();
};

var isFiredArrow = function() {
  if (mousePos && drawnBack && mouseUp) { drawnBack = false; firedArrow = true; }
};
var isDrawnBack = function() {
  if (mousePos && isInCircle(mousePos)) {
    if (mouseDown) drawnBack = true;
    else if (mouseUp) drawnBack = false;
  }
};

var update = function() {
  isDrawnBack();
  isFiredArrow();
  if (firedArrow) { currArrow.fireArrow(); firedArrow = false; }
  ctx.clearRect(0, 0, cWidth, cHeight);
};

var render = function() {
  drawCircles();
  for (var i = 0; i < arrows.length; i++) arrows[i].drawArrow();
  drawScene();
};

var main = function() {
  update();
  render();
  requestAnimationFrame(main);
};

addArrow();
var currArrow = arrows[0];
main();
`;

// Build the full HTML document that will be injected into the iframe
const buildSrcdoc = () => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Archery — Classic</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #ddeeff; }
    canvas { display: block; }
  </style>
</head>
<body>
  <script>${ARROW_JS}<\/script>
  <script>${ARCHERY_JS}<\/script>
</body>
</html>`;

export default function ClassicArcheryPage() {
  return (
    <div style={{ width: '100dvw', height: '100dvh', overflow: 'hidden', background: '#ddeeff' }}>
      <iframe
        title="Classic Archery Game"
        srcDoc={buildSrcdoc()}
        style={{
          width:  '100%',
          height: '100%',
          border: 'none',
          display: 'block',
        }}
        sandbox="allow-scripts"
        allow="accelerometer; gyroscope"
      />
    </div>
  );
}
