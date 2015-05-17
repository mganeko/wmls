# WMLS: WebM Live Streaming
WebM Live Streaming with getUserMedia and MediaRecorder for Firefox.

This project is experimental.

Firefox で使えるgetUserMediaと、MadiaRecorder を利用したライブストリーミングの実験です。

# Installation
This project is written for node.js.

## install modules with npm
```
  npm install multiparty
  npm install express
  npm install node-uuid
  npm install ejs
```

or just type
```
  npm install
```

# How to use
## run server
```
  node app.js
```

## to start Live streaming
* Open http://localhost:8000/ with firefox
* Type channel name and click [Go Live] button
* Click [Start Video] button
* Click [Start Live] button

## to watch Live streamig
* Wait 10 sec, after start live streaming
* Open http://localhost:8000/ with firefox
* Type channel name and click [Watch] button  

# License
This poroject is MIT license.

