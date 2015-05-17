# WMLS: WebM Live Streaming
WebM Live Streaming with getUserMedia and MediaRecorder for Firefox.

This project is experimental.

Firefox で使えるgetUserMediaと、MadiaRecorder を利用したライブストリーミングの実験です。

# Installation
This project is written for node.js.

このプロジェクトはnode.jsです。

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
* Open http://localhost:8000/ with Firefox
* Type channel name and click [Go Live] button
* Click [Start Video] button
* Click [Start Live] button
* Wait 10 sec, then link for watch streaming will appear

## to watch Live streaming
* Wait 10 sec, after start live streaming
* Open http://localhost:8000/ with Firefox or Chrome
* Type channel name and click [Watch] button

## ライブストリーミングの始め方
* Firefoxで、http://localhost:8000/ にアクセス
* 好きなチャンネル名を指定し、[Go Live]ボタンをクリック
* [Start Video] ボタンをクリック。カメラ/マイクへのアクセスを許可
* [Start Live] ボタンをクリック
* 10秒待つと、ライブストリーミングを見るためのリンクが表示される

## ライブストリーミングの見方
* ライブ開始後10秒待つ
* Firefox または Chrome で、http://localhost:8000/ にアクセス
* チャネルを指定し、[Watch]ボタンをクリック


# License
This poroject is MIT license.

