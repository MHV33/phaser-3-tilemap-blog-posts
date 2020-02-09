/**
 * Author: Michael Hadley, mikewesthad.com
 * Asset Credits:
 *  - Tuxemon, https://github.com/Tuxemon/Tuxemon
 */

const config = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  parent: "game-container",
  pixelArt: true,
  physics: {
    default: "arcade",
    arcade: {
      gravity: { y: 0 }
    }
  },
  scene: {
    preload: preload,
    create: create,
    update: update
  }
};

let game = new Phaser.Game(config);
let cursors;
let player;
let showDebug = false;

function preload() {
  game.currentScene = this;
  this.load.image("tiles", "../assets/tilesets/tuxmon-sample-32px-extruded.png");
  this.load.tilemapTiledJSON("map", "../assets/tilemaps/tuxemon-town.json");

  // An atlas is a way to pack multiple images together into one texture. I'm using it to load all
  // the player animations (walking left, walking right, etc.) in one image. For more info see:
  //  https://labs.phaser.io/view.html?src=src/animation/texture%20atlas%20animation.js
  // If you don't use an atlas, you can do the same thing with a spritesheet, see:
  //  https://labs.phaser.io/view.html?src=src/animation/single%20sprite%20sheet.js
  this.load.atlas("atlas", "../assets/atlas/atlas.png", "../assets/atlas/atlas.json");
}

function create() {
  let map = this.make.tilemap({ key: "map" });


  // Handles the clicks on the map to make the character move
  this.input.on('pointerup', game.handleClick);

  // Parameters are the name you gave the tileset in Tiled and then the key of the tileset image in
  // Phaser's cache (i.e. the name you used in preload)
  const tileset = map.addTilesetImage("tuxmon-sample-32px-extruded", "tiles");

  // Parameters: layer name (or index) from Tiled, tileset, x, y
  const belowLayer = map.createStaticLayer("Below Player", tileset, 0, 0);
  var worldLayer = map.createDynamicLayer("World", tileset, 0, 0);
  const aboveLayer = map.createStaticLayer("Above Player", tileset, 0, 0);
  game.worldLayer = worldLayer;

  worldLayer.setCollisionByProperty({ collides: true });

  // By default, everything gets depth sorted on the screen in the order we created things. Here, we
  // want the "Above Player" layer to sit on top of the player, so we explicitly give it a depth.
  // Higher depths will sit on top of lower depth objects.
  aboveLayer.setDepth(10);

  game.map = map;

  // Object layers in Tiled let you embed extra info into a map - like a spawn point or custom
  // collision shapes. In the tmx file, there's an object layer with a point named "Spawn Point"
  const spawnPoint = map.findObject("Objects", obj => obj.name === "Spawn Point");

  // Create a sprite with physics enabled via the physics system. The image used for the sprite has
  // a bit of whitespace, so I'm using setSize & setOffset to control the size of the player's body.
  player = this.physics.add
    .sprite(spawnPoint.x, spawnPoint.y, "atlas", "misa-front")
    .setSize(30, 40)
    .setOffset(0, 24);

  // Watch the player and worldLayer for collisions, for the duration of the scene:
  this.physics.add.collider(player, worldLayer);

  // Create the player's walking animations from the texture atlas. These are stored in the global
  // animation manager so any sprite can access them.
  const anims = this.anims;
  anims.create({
    key: "misa-left-walk",
    frames: anims.generateFrameNames("atlas", {
      prefix: "misa-left-walk.",
      start: 0,
      end: 3,
      zeroPad: 3
    }),
    frameRate: 10,
    repeat: -1
  });
  anims.create({
    key: "misa-right-walk",
    frames: anims.generateFrameNames("atlas", {
      prefix: "misa-right-walk.",
      start: 0,
      end: 3,
      zeroPad: 3
    }),
    frameRate: 10,
    repeat: -1
  });
  anims.create({
    key: "misa-front-walk",
    frames: anims.generateFrameNames("atlas", {
      prefix: "misa-front-walk.",
      start: 0,
      end: 3,
      zeroPad: 3
    }),
    frameRate: 10,
    repeat: -1
  });
  anims.create({
    key: "misa-back-walk",
    frames: anims.generateFrameNames("atlas", {
      prefix: "misa-back-walk.",
      start: 0,
      end: 3,
      zeroPad: 3
    }),
    frameRate: 10,
    repeat: -1
  });



  cursors = this.input.keyboard.createCursorKeys();

  // Help text that has a "fixed" position on the screen
  this.add
    .text(16, 16, 'Arrow keys to move\nPress "D" to show hitboxes', {
      font: "18px monospace",
      fill: "#000000",
      padding: { x: 20, y: 10 },
      backgroundColor: "#ffffff"
    })
    .setScrollFactor(0)
    .setDepth(30);

  // Debug graphics
  this.input.keyboard.once("keydown_D", event => {
    // Turn on physics debugging to show player's hitbox
    this.physics.world.createDebugGraphic();

    // Create worldLayer collision graphic above the player, but below the help text
    const graphics = this.add
      .graphics()
      .setAlpha(0.75)
      .setDepth(20);
    worldLayer.renderDebug(graphics, {
      tileColor: null, // Color of non-colliding tiles
      collidingTileColor: new Phaser.Display.Color(243, 134, 48, 255), // Color of colliding tiles
      faceColor: new Phaser.Display.Color(40, 39, 37, 255) // Color of colliding face edges
    });
  });

  // Marker that will follow the mouse
  game.marker = this.add.graphics();
  game.marker.lineStyle(3, 0xffffff, 1);
  game.marker.strokeRect(0, 0, game.map.tileWidth, game.map.tileHeight);
  game.marker.setDepth(15);

  // ### Pathfinding stuff ###
  // Initializing the pathfinder
  game.finder = new EasyStar.js();

  // We create the 2D array representing all the tiles of our map
  var grid = [];
  for (var y = 0; y < game.map.height; y++) {
    var col = [];
    for (var x = 0; x < game.map.width; x++) {
      // In each cell we store the ID of the tile, which corresponds
      // to its index in the tileset of the map ("ID" field in Tiled)
      col.push(game.getTileID(x, y));
    }
    grid.push(col);
  }
  game.finder.setGrid(grid);


  var tileset2 = game.map.tilesets[0];
  var properties = tileset2.tileProperties;
  var acceptableTiles = [];

  // We need to list all the tile IDs that can be walked on. Let's iterate over all of them
  // and see what properties have been entered in Tiled.

  for (var i = tileset2.firstgid - 1; i < tileset.total; i++) { // firstgid and total are fields from Tiled that indicate the range of IDs that the tiles can take in that tileset
    if (!properties.hasOwnProperty(i)) {
      // If there is no property indicated at all, it means it's a walkable tile
      acceptableTiles.push(i + 1);
      continue;
    }
    if (!properties[i].collides) acceptableTiles.push(i + 1);
    if (properties[i].cost) game.finder.setTileCost(i + 1, properties[i].cost); // If there is a cost attached to the tile, let's register it
  }
  game.finder.setAcceptableTiles(acceptableTiles);

  const camera = this.cameras.main;
  camera.startFollow(player);
  //camera.startFollow(game.marker);
  camera.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
  game.camera = camera;
}

function update(time, delta) {
  const speed = 175;
  const prevVelocity = player.body.velocity.clone();

  // Stop any previous movement from the last frame
  player.body.setVelocity(0);

  // Horizontal movement
  if (cursors.left.isDown) {
    player.body.setVelocityX(-speed);
  } else if (cursors.right.isDown) {
    player.body.setVelocityX(speed);
  }

  // Vertical movement
  if (cursors.up.isDown) {
    player.body.setVelocityY(-speed);
  } else if (cursors.down.isDown) {
    player.body.setVelocityY(speed);
  }

  // Normalize and scale the velocity so that player can't move faster along a diagonal
  player.body.velocity.normalize().scale(speed);

  // Update the animation last and give left/right animations precedence over up/down animations
  if (cursors.left.isDown) {
    player.anims.play("misa-left-walk", true);
  } else if (cursors.right.isDown) {
    player.anims.play("misa-right-walk", true);
  } else if (cursors.up.isDown) {
    player.anims.play("misa-back-walk", true);
  } else if (cursors.down.isDown) {
    player.anims.play("misa-front-walk", true);
  } else {
    player.anims.stop();

    // If we were moving, pick and idle frame to use
    if (prevVelocity.x < 0) player.setTexture("atlas", "misa-left");
    else if (prevVelocity.x > 0) player.setTexture("atlas", "misa-right");
    else if (prevVelocity.y < 0) player.setTexture("atlas", "misa-back");
    else if (prevVelocity.y > 0) player.setTexture("atlas", "misa-front");
  }

  //used to set cursor marker
  var worldPoint = this.input.activePointer.positionToCamera(this.cameras.main);

  // Rounds down to nearest tile
  var pointerTileX = game.map.worldToTileX(worldPoint.x);
  var pointerTileY = game.map.worldToTileY(worldPoint.y);
  game.marker.x = game.map.tileToWorldX(pointerTileX);
  game.marker.y = game.map.tileToWorldY(pointerTileY);
  game.marker.setVisible(!game.checkCollision(pointerTileX, pointerTileY));
}

game.checkCollision = function (x, y) {

  var tile = game.map.getTileAt(x, y, false, "World");
  if (tile == null) return false;
  return tile.properties.collides == true;
};

game.getTileID = function (x, y) {

  var tile = game.map.getTileAt(x, y, false, "World");
  if (tile == null) {
    tile = game.map.getTileAt(x, y, false, "Below Player");
  }
  return tile.index;
};

game.handleClick = function (pointer) {
  console.log('handleClick()');
  var x = game.camera.scrollX + pointer.x;
  var y = game.camera.scrollY + pointer.y;
  var toX = Math.floor(x / 32);
  var toY = Math.floor(y / 32);
  var fromX = Math.floor(player.x / 32);
  var fromY = Math.floor(player.y / 32);
  console.log('going from (' + fromX + ',' + fromY + ') to (' + toX + ',' + toY + ')');

  game.finder.findPath(fromX, fromY, toX, toY, function (path) {
    if (path === null) {
      console.warn("Path was not found.");
    } else {
      console.log(path);
      game.moveCharacter(path);
    }
  });
  game.finder.calculate(); // don't forget, otherwise nothing happens

  game.changeTile();
};

game.changeTile = function () {
  var tile = game.worldLayer.putTileAtWorldXY(2, game.marker.x, game.marker.y);
  console.log("tile.properties: " + tile.properties);

  tile.setCollision(true);
  game.finder.avoidAdditionalPoint(game.map.worldToTileX(game.marker.x), game.map.worldToTileY(game.marker.y));
  //game.worldLayer.setCollisionByProperty({ collides: true });
}

game.moveCharacter = function (path) {
  console.log('moveCharacter()');
  // Sets up a list of tweens, one for each tile to walk, that will be chained by the timeline
  var tweens = [];
  for (var i = 0; i < path.length - 1; i++) {
    var ex = path[i + 1].x;
    var ey = path[i + 1].y;
    tweens.push({
      targets: player,
      x: { value: ex * game.map.tileWidth, duration: 200 },
      y: { value: ey * game.map.tileHeight, duration: 200 }
    });
  }

  game.currentScene.tweens.timeline({
    tweens: tweens
  });
};
