/// <reference path="typings/node/node.d.ts"/>

//
// WMLS server.
// same as app.js but using original logic for pipe and wait blobs
// 

var multiparty = require('multiparty')
var express = require('express');
var path = require('path');
var fs = require('fs');
var stream = require('stream');
var util = require('util');
var uuid = require('node-uuid');
//var CombinedStream = require('combined-stream');
var clusterIntervalSec = 5;

//var port = 8080;
var port = 8000;

//var serverURL = 'loalhost:8080';
var serverURL = 'loalhost:' + port;
//var serverURL = 'kurento.talkin.info:8080';

// TODO
//  DONE. video cache disable
//  maybe DONE. unstable for stream. maybe file exist but not finish writing.
//  DONE. sound test
//  DONE. stop server streaming/appendFile on client disconnect
//  NOT: clean up old files when live started
//  DONE: or make directory when golive with channel name and time/uuid
//  DONE: make hash-id with start time

// STUDY
//  MediaSource API


function ChannelStatus() {
 //var self = this;
 var name = '';
 var uuid = '';
 var dir = '';
 var isOnAir = false;
 var currentSeq = 0;
 var currentSec = 0;
 var storedSec = 0;
 var filePrefix = '';
};
var channels = {}; // channel status has

function startChannel(name) {
 var channelStatus = channels[name];
 if (! channelStatus) {
  // create new channel
  channelStatus = new ChannelStatus();
 }
 else if (channelStatus.isOnAir) {
  // already onAir
  return null;
 }
 
 channelStatus.name = name;
 channelStatus.uuid = uuid.v1();
 channelStatus.dir = path.join( __dirname, 'mov', 'd_' + name +  '_' +channelStatus.uuid);
 channelStatus.filePrefix = path.join(channelStatus.dir, 'v_' + channelStatus.name);
 channelStatus.isOnAir = true;
 channelStatus.currentSeq = 0;
 channelStatus.currentSec = 0;
 channelStatus.storedSec = 0;
 channels[name] = channelStatus;
 
 // make directory
 fs.mkdir(channelStatus.dir, function (err) {
  console.log('mkdir:' + channelStatus.dir + ' err=' + err);
 });
 
 return channelStatus;
}

function getChannelStatus(name) {
 var channelStatus = channels[name];
 return channelStatus;
}

// http://jxck.hatenablog.com/entry/20111204/1322966453
function SleepStream() {
 this.readable = true;
 this.timer = null;
 this.piped = false;
 this.paused = true;
}

util.inherits(SleepStream, stream.Stream);

SleepStream.prototype.resume = function() {
 console.log('---SleepStream start timeout on resume.');
 if (! this.paused) {
  console.log('---SleepStream not paused in resume(). do nothing.');
  return;
 }
 
 this.paused = false;
 this.timer = setTimeout(function() {
  console.log('---SleepStream timeout and emit end.');
  this.timer = null;
  return this.emit('end');
 }.bind(this), 1000);
};

SleepStream.prototype.pause = function() {
 //if (this.timer) {
 // clearTimout(this.timer);
 //}
 if (this.paused) {
  console.log('---SleepStream already paused in pause(). do nothing.');
  return;
 }
 else {
  this.paused = true;
 }
};

SleepStream.prototype.pipe = function(dest) {
  this.piped = true;

  // ここでは stream.Stream.prototype.pipe.apply(this, arguments); もok
  this.on('data', function(data) {
    dest.write(data);
  });
};

SleepStream.prototype.setEncoding = function(encoding) {};
SleepStream.prototype.destroy = function() {};
SleepStream.prototype.destroySoon = function() {};


// ------------ application ------------

var app = express();
app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');
app.use(express.static(__dirname + '/public'));

app.get('/', function (req, res) {
  console.log('get /');
  res.render('index', { title: 'Express Sample' });
});
app.get('/watch/:channel', function (req, res) {
  var channel = req.params.channel;
  var channelStatus = getChannelStatus(channel);
  if (! channelStatus) {
   console.error('ERROR. channel:' + channel + ' not onAir');
   res.writeHead(404, {'content-type': 'text/plain'});
   res.end('not found'); 
   return;
  }
  //var streamUuid = uuid.v1() + '--' +  uuid.v4(); 
  var streamUuid = uuid.v1() + '--' + channelStatus.storedSec; 
  console.log('get /watch/' + channel + ' uuid=' + streamUuid);
  res.render('watch', { title: 'watch ' + channel, channel: channel, uuid: streamUuid, server: serverURL });
});

app.get('/stream/:channel', function (req, res) { // this way is ok , with combined-stream
  var channel = req.params.channel;
  console.log('get /stream/' + channel);
  var channelStatus = getChannelStatus(channel);
  if (! channelStatus) {
   console.error('ERROR. channel:' + channel + ' not onAir');
   res.writeHead(404, {'content-type': 'text/plain'});
   res.end('not found'); 
   return;
  }

  var streamPosSec = Number(channelStatus.storedSec);
  /*
  var streamPosSec = Number(channelStatus.storedSec - clusterIntervalSec); // try for write stable
  if (streamPosSec < 0) {
   streamPosSec = 0;
  }
  */
  
  var headerAppended = false;
  var sleepCount = 0;
  var sleepCountMax = 10;
  //var fileStableWait = false;
  
  function appendFile(res) {
   // -- keep response test is OK --
   //console.log('... appendFile keep respose test ..');
   //setTimeout(appendFile, 2000);
   //return;
  
   var filename;
   if (! headerAppended) {
    filename = channelStatus.filePrefix + '.webh';
   }
   else {
    filename = channelStatus.filePrefix + '_'  + streamPosSec + '.webm';
   }
   console.log('start read file for ' + filename + ' ---');
   
   // -- check file exist --
   var b = path.existsSync(filename);
   if (b) {
    console.log('file EXIST:' + filename);
    sleepCount = 0;
    
    
    // --- create read stream ---
    var readStream = fs.createReadStream( filename );
    readStream.on('error', onError);
    
    //console.log(' -- bofere add on --');
    //console.log(readStream.listeners('end'));
    
    readStream.on('end', function() {
     console.log('--- end of ' + filename);
     readStream.unpipe(res);
     if (! headerAppended) {
      headerAppended = true;
     }
     else {
      streamPosSec += clusterIntervalSec;
     }
     appendFile(res);
    });

    //console.log(' -- before pipe --');
    var listners = readStream.listeners('end');
    var count = listners.length;
    //console.log(count, listners);
    
    console.log('-pipe readStream to res : ' + filename + ' -'); 
    readStream.pipe(res);
    
    //console.log(' -- after pipe --');
    listners = readStream.listeners('end');
    var listner = listners[count];
    //console.log(listners.length, listners, listner);
    readStream.removeListener('end', listner);
    //console.log(' -- after remove --');
    //listners = readStream.listeners('end');
    //console.log(listners.length, listners);
   }
   else {
    console.log('file NOT EXIST:' + filename);
    sleepCount++;
    if (sleepCount > sleepCountMax) {
     console.error('TOO MANY times to sleep.');
     res.end();
     return;
    }

    // ---- wait for file ---
    console.log('setTimeout()');
    var tryInterval = 1000; // mili sec
    setTimeout(appendFile, tryInterval, res);
   }
  }
  

  res.on('close', function() {
   console.log('CLOSE on response stream');  // close event fired, when browser window closes
  });
  res.on('end', function() {
   console.log('!!!!! END on response stream');
  });
  
  res.writeHead(200, {'Content-Type': 'video/webm', 'Cache-Control': 'no-cache, no-store'});
  appendFile(res);
  return;
   
  function onError(err) {
   console.error('ERROR on readStream, ', err); 
  }
});
app.get('/golive/:channel', function (req, res) {
  var channel = req.params.channel;
  var channelStatus = startChannel(channel);
  if (! channelStatus) {
   console.error('ERROR. channel:' + channel + ' already onAir');
  }
  
  res.render('golive', { title: 'GoLive ' + channel, channel: channel });
});
app.post('/upload/:channel',  function (req, res) {
  var channel = req.params.channel;
  //console.log('POSTED:: ', req.headers);
  console.log('POSTED:: ');
  var channelStatus = getChannelStatus(channel);
  if (! channelStatus) {
   console.error('ERROR. channel:' + channel + ' not ready for onAir');
  }

  var form = new multiparty.Form( {maxFieldsSize: 4096*1024} );
  form.parse(req, function(err, fields, files) {
   if (err) {
    console.error('form parse error');
    console.error(err);

    res.writeHead(500, {'content-type': 'text/plain'});
    res.end('Server Error'); 
    return;
   }

   var postIndex = fields.blob_index[0];
   var postSec = fields.blob_sec[0];
   var filename =  channelStatus.filePrefix + '_'  + postSec + '.webm';
   console.log('receive channel=' + channel + ' index=' + postIndex + ' sec=' + postSec + ' filename=' + filename);

   var buf = new Buffer(fields.blob_base64[0], 'base64'); // decode
   var clusterPos = findCluster(buf, 0, buf.length);
   console.log('cluster pos=' + clusterPos + '  0x' + addrHex(clusterPos));
   if (clusterPos > 0) {
    // first webm. split header and cluster
    var headerFile =  channelStatus.filePrefix + '.webh';
    writeWebmHeader(headerFile, buf, clusterPos);
   }
   else if (clusterPos < 0) {
    console.error('cluster NOT found. BAD blob');
    res.writeHead(500, {'content-type': 'text/plain'});
    res.end('Server Error'); 
    return;    
   }
   
   writeWebmCluster(filename, buf, clusterPos, buf.length);
   channelStatus.currentSeq = postIndex;
   channelStatus.currentSec = postSec;
   channelStatus.storedSec = postSec;
   
   // delete old cluster
   if (postSec >= 10) {
    var removeSec = postSec - clusterIntervalSec*2;
    var removeFilename =  channelStatus.filePrefix + '_'  + removeSec + '.webm';
    fs.unlink(removeFilename, function() {
     console.log('-- remove old cluster: ' + removeFilename);
    });
   }

   res.writeHead(200, {'content-type': 'text/plain'});
   res.write('received upload:\n\n');
   res.end('upload index=' + postIndex + ' , sec=' + postSec); 

  });
});

app.listen(port);
console.log('server listen start port ' + port);


// =======

function writeWebmHeader(filename, buf, endPosition) {
 console.log('writeWebmHeader()');
 var wstream = fs.createWriteStream(filename);
 var bufToWrite = buf.slice(0, endPosition);
 console.log('endPosition=' + endPosition + ' bufToWrite.length=' + bufToWrite.length);
 wstream.write(bufToWrite);
 wstream.end();
}

function writeWebmCluster(filename, buf, startPosition, endPosition) {
 console.log('writeWebmCluster()');
 var wstream = fs.createWriteStream(filename);
 var bufToWrite = buf.slice(startPosition, endPosition);
 console.log('endPosition=' + endPosition + ' bufToWrite.length=' + bufToWrite.length);
 wstream.write(bufToWrite);
 wstream.end();
}

/*======== NOT USED =========
// -- NG ---
function prepareReadStream(filename, retryCount) {
 var tryInterval = 1000; // mili sec
 console.log('prepareReadStream() file=' + filename + ' retryCount=' + retryCount);
 if (retryCount < 0) {
  return null;
 }
 
 while (1) {
  var readStream = fs.createReadStream( filename );
  readStream.on('error', function() {
   setTimeout(prepareReadStream, tryInterval, filename, retryCount-1);
  });
  readStream.on('readable', function() {
   return readStream;
  });
 }
 
 console.warn('prepareReadStream() May not reach here');
 return null;
}

// -- NG ---
function waitFileReady(filename, retryCount) {
 var tryInterval = 1000; // mili sec
 console.log('waitFileReady() retryCount=' + retryCount + ' file=' + filename);
 if (retryCount < 0) {
  return false;
 }
 
 while(1) {
  var stat = fs.statSync(filename);
  if (stat.isFile()) {
   console.log('file is ready:' + filename);
   return true;
  }
  else {
  }
 }
}



// -- NG ---
function appendNextStream(nextFunc, filename, retryCount) {
 var tryInterval = 1000; // mili sec
 console.log('appendNextStream() file=' + filename + ' retryCount=' + retryCount);
 if (retryCount < 0) {
  return null;
 }

 var readStream = fs.createReadStream( filename );
 readStream.on('error', function() {
  setTimeout(appendNextStream, tryInterval, nextFunc, filename, retryCount-1);
  return null;
 });
 readStream.on('readable', function() {
  return nextFunc(readStream);
 });
}
======== NOT USED =========*/


// ============
var tagDictionary = setupTagDictionary();


function findCluster(buffer, position, maxLength) {
 while (position < maxLength) {
  // -- ADDRESS --
  //console.log('ADDR 0x' + addrHex(position));

  // -- TAG --
  var result = scanWebmTag(buffer, position);
  if (! result) {
   console.error('TAG scan end. Cluster not found');
   break;
  }
  var tagName = tagDictionary[result.str];
  if (tagName === 'Cluster') {
   console.log('find Clunster: pos=' + position);
   return position;
  }

  //console.log('tag=' + tagName + ' , continue reading');
  position += result.size;

  // --- DATA SIZE ---
  result = scanDataSize(buffer, position);
  if (! result) {
   console.error('DATA SIZE scan end');
   break; 
  }
  position += result.size;
 
  // ---- DATA ----
  if (result.value >= 0) {
   position += result.value;
  }
  else {
   console.log(' DATA SIZE ffffffff.. cont.');
  }
 
  // -- check EOF ---
  if (position == maxLength) {
   console.log(' reached END---');
   break;
  }
  else if (position > maxLength) {
   console.log(' --OVER END---' + ' pos=' + position + ' max=' + maxLength );
   break;
  }
 }

 return -1; // ERROR
}


function parseWebm(level, buffer, position, maxPosition) {
 while (position < maxPosition) {
  var spc = spacer(level);
  
  // -- ADDRESS --
  console.log(spc + 'ADDR 0x' + addrHex(position) + ' -- Level:' + level + ' BEGIN' );
 
  // -- TAG --
  var result = scanWebmTag(buffer, position);
  if (! result) {
   console.log(spc + 'TAG scan end');
   break; 
  }
  var tagName = tagDictionary[result.str];
  console.log(spc + 'Tag size=' + result.size + ' Tag=' + result.str + ' <' + tagName + '> TagVal=' + result.value); 
  position += result.size;
 
  // --- DATA SIZE ---
  result = scanDataSize(buffer, position);
  if (! result) {
   console.log(spc + 'DATA SIZE scan end');
   break; 
  }
  console.log(spc + 'DataSize size=' + result.size + ' DataSize str=' + result.str + ' DataSize Val=' + result.value);
  position += result.size;
 
  // ---- DATA ----
  if (tagName === 'EBML') {
   parseWebm(level+1, buffer, position, (position + result.value));
  }
  else if (tagName === 'Segment') {
   parseWebm(level+1, buffer, position, (position + result.value));
  }
  else if (tagName === 'Cluster') {   
   parseWebm(level+1, buffer, position, (position + result.value));
  }
  else if (tagName === 'Timecode') {
   var timecode = scanDataValueU(buffer, position, result.value);
   console.log(spc + 'timecode=' + timecode);
   
   return position;
  }
 
  if (result.value >= 0) {
   position += result.value;
  }
  else {
   console.log(spc + 'DATA SIZE ffffffff.. cont.');
  }
  console.log(' ');
 
  // -- check EOF ---
  if (position == maxPosition) {
   console.log(spc + '--level:' + level + ' reached END---');
   break;
  }
  else if (position > maxPosition) {
   console.log(spc + '--level:' + level + ' --OVER END---' + ' pos=' + position + ' max=' + maxPosition );
   break;
  }
 }
 
 return position;
}


function addrHex(pos) {
 var str = '00000000' + pos.toString(16);
 var len = str.length;
 return str.substring(len - 8).toUpperCase();
}

function byteToHex(b) {
 var str = '0' + b.toString(16);
 var len = str.length;
 return str.substring(len - 2).toUpperCase();
}

function spacer(level) {
 var str = '          ';
 str = str.substring(0, level);
 return str;
}

function setupTagDictionary() {
 // T - Element Type - The form of data the element contains.
 //   m: Master, u: unsigned int, i: signed integer, s: string, 8: UTF-8 string, b: binary, f: float, d: date
 
 var tagDict = new Array();
 tagDict['[1A][45][DF][A3]'] = 'EBML'; // EBML 0	[1A][45][DF][A3] m
 tagDict['[42][86]'] = 'EBMLVersion'; //EBMLVersion	1	[42][86] u
 tagDict['[42][F7]'] =  'EBMLReadVersion'; // EBMLReadVersion	1	[42][F7] u
 tagDict['[42][F2]'] =  'EBMLMaxIDLength'; // EBMLMaxIDLength	1	[42][F2] u
 tagDict['[42][F3]'] =  'EBMLMaxSizeLength'; // EBMLMaxSizeLength	1	[42][F3] u
 tagDict['[42][82]'] =  'DocType'; // DocType	1	[42][82] s
 tagDict['[42][87]'] =  'DocTypeVersion'; // DocTypeVersion	1	[42][87] u
 tagDict['[42][85]'] =  'DocTypeReadVersion'; // DocTypeReadVersion	1	[42][85] u
 
 tagDict['[EC]'] =  'Void'; // Void	g	[EC] b
 tagDict['[BF]'] =  'CRC-32'; // CRC-32	g	[BF] b
 tagDict['[1C][53][BB][6B]'] =  'Cues'; // Cues	1	[1C][53][BB][6B] m
 
 tagDict['[18][53][80][67]'] = 'Segment';  // Segment	0	[18][53][80][67] m
 tagDict['[11][4D][9B][74]'] = 'SeekHead'; // SeekHead	1	[11][4D][9B][74] m
 tagDict['[4D][BB]'] = 'Seek'; // Seek	2	[4D][BB] m
 tagDict['[53][AB]'] = 'SeekID'; // SeekID	3	[53][AB] b
 tagDict['[53][AC]'] = 'SeekPosition'; // SeekPosition	3	[53][AC] u
  
 tagDict['[15][49][A9][66]'] = 'Info'; // Info	1	[15][49][A9][66] m 

 tagDict['[16][54][AE][6B]'] = 'Tracks'; // Tracks	1	[16][54][AE][6B] m
 
 tagDict['[1F][43][B6][75]'] = 'Cluster'; // Cluster	1	[1F][43][B6][75] m
 tagDict['[E7]'] = 'Timecode'; // Timecode	2	[E7] u
 tagDict['[A3]'] = 'SimpleBlock'; // SimpleBlock	2	[A3] b
 
 return tagDict;
}

function scanWebmTag(buff, pos) {
 var tagSize = 0;
 //var followByte;
 var firstByte = buff.readUInt8(pos);
 var firstMask = 0xff;
 
 if (firstByte & 0x80) {
  tagSize = 1;
 }
 else if (firstByte & 0x40) {
  tagSize = 2;
 }
 else if (firstByte & 0x20) {
  tagSize = 3;
 }
 else if (firstByte & 0x10) {
  tagSize = 4;
 }
 else {
  console.log('ERROR: bad TAG byte');
  return null;
 }

 var decodeRes = decodeBytes(buff, pos, tagSize, firstByte, firstMask); 
 return decodeRes;
}


function scanDataSize(buff, pos) {
 var dataSizeSize = 0;
 //var followByte;
 var firstByte = buff.readUInt8(pos);
 var firstMask;
 
 if (firstByte & 0x80) {
  dataSizeSize = 1;
  firstMask = 0x7f;
 }
 else if (firstByte & 0x40) {
  dataSizeSize = 2;
  firstMask = 0x3f;
 }
 else if (firstByte & 0x20) {
  dataSizeSize = 3;
  firstMask = 0x1f;
 }
 else if (firstByte & 0x10) {
  dataSizeSize = 4;
  firstMask = 0x0f;
 }
 else if (firstByte & 0x08) {
  dataSizeSize = 5;
  firstMask = 0x07;
 }
 else if (firstByte & 0x04) {
  dataSizeSize = 6;
  firstMask = 0x03;
 }
 else if (firstByte & 0x02) {
  dataSizeSize = 7;
  firstMask = 0x01;
 }
 else if (firstByte & 0x01) {
  dataSizeSize = 8;
  firstMask = 0x00;
 }
 else {
  console.log('ERROR: bad DATA byte');
  return null;
 }
  
 var decodeRes = decodeBytes(buff, pos, dataSizeSize, firstByte, firstMask); 
 return decodeRes;
}

function scanDataValueU(buff, pos, size) {
 var uVal = 0;
 var byteVal;
 for (var i = 0; i < size; i++) {
  byteVal = buff.readUInt8(pos + i);
  //console.log('scanDataValueU pos=' + pos + ' i=' + i + ' byte=' + byteToHex(byteVal));
  uVal = (uVal << 8) + byteVal;
 }
 
 return uVal;
}

function decodeBytes(buff, pos, size, firstByte, firstMask) {
 var value = firstByte & firstMask;
 var str = ('[' + byteToHex(firstByte) + ']');
 var followByte;
 for (var i = 1; i < size; i++) {
   followByte = buff.readUInt8(pos + i);
   str += '[';
   str += byteToHex(followByte);
   str += ']';
   value = (value << 8) + followByte;
 }
 
 var res = {};
 res.str = str;
 res.size = size;
 res.value = value;
 
 return res;
}
