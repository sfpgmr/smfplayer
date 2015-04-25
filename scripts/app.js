/// <reference path="http://oss.maxcdn.com/d3js/3.5.5/d3.js" />
/// <reference path="http://maxcdn.bootstrapcdn.com/bootstrap/3.3.4/js/bootstrap.min.js" />
/// <reference path="./scripts/bootstrap-slider.js" />
/// <reference path="./scripts/SMFreader.js" />
/// <reference path="./scripts/sequencer.js" />

function panic()
{
  var outputs = sequencer.midiAccess.outputs;
  for(var j = 0,end = outputs.length;j < end;++j)
  {
    var out = outputs[j];
    for (var i = 0; i < 16; ++i)
    {
      var msg = [0xB0 | i, 0x79, 0x00];
      out.send(msg);

      var msg = [0xB0 | i, 0x7B, 0x00];
      out.send(msg);

      var msg = [0xB0 | i, 0x78, 0x00];
      out.send(msg);
    }
    
  }
}

function allNoteOff(out)
{
  for (var i = 0; i < 16; ++i)
  {
    var msg = [0xB0 | i, 0x7B, 0x00];
    out.send(msg);

  }
}

function allSoundOff(out)
{
  for (var i = 0; i < 16; ++i)
  {
    var msg = [0xB0 | i, 0x78, 0x00];
    out.send(msg);
  }
}

// pianoRoll
function sendCC(out,val1,val2,ch)
{
  if (!ch) ch = 0;
  if(out)
  {
    var msg = [0xb0 | ch,val1,val2];
    out.send(msg);
  }
}

function initEffects(out)
{
  if(out)
  {
    sendCC(out,7,64); // Volume
    sendCC(out,1,0); // Mod
    sendCC(out,0x5b, 0); // reverb
    sendCC(out,0x5d, 0); // chorus
    sendCC(out,0x5e, 0); // variation
  }
}

var song;

function parseSMF(file)
{
  song = new Song(file.name);
  song.stepsPerBeat = file.ticksPerBeat;
  for(var i = 0;i < file.numTracks;++i)
  {
    var track = midiFile.tracks[i];
    var stepMax = 0;
    var trackName = track.trackName ? track.trackName : "";
    var songTrack = new Track(trackName);
    song.tracks.push(songTrack);
    var events = track.events;
    var noteBuffer = [];
    var step_bkp = 0;
    for(var j = 0,l = events.length;j < l;++j)
    {
      var ev = events[j];
      var step = ev.delta;
      stepMax += ev.delta;
      if(step)
      {
        for(var k = 0;k < noteBuffer.length;++k)
        {
          if(noteBuffer[k])
          {
            noteBuffer[k].event.gate += step;
          }
        }
      }
      step += step_bkp;
      step_bkp = 0;
      switch(ev.type)
      {
        case "MIDI":
          if (songTrack.channel == null)
          {
            songTrack.channel = ev.midiChannel;
          }
          switch (ev.midiEventType)
          {
            case 0x08: // Note Off
              for (var k = 0; k < noteBuffer.length; ++k)
              {
                if (noteBuffer[k] && (noteBuffer[k].event.note == ev.parameter1) && (noteBuffer[k].channel == ev.midiChannel))
                {
                  noteBuffer[k] = null;
                }
              }
              step_bkp = step;
              break;
            case 0x09: // Note On

              if (ev.parameter2 > 0)
              {
                /* var found = false
                for (var k = 0; k < noteBuffer.length; ++k)
                {
                if (noteBuffer[k] && (noteBuffer[k].event.note == ev.parameter1) && (noteBuffer[k].channel == ev.midiChannel))
                {
                found = true;
                }
                }
                if (found)
                {
                step_bkp = step;
                } else
                {*/
                var noteEvent = new MidiEvent(step, ev.midiChannel, new Note(ev.parameter1, 0, ev.parameter2));
                songTrack.events.push(noteEvent);
                noteBuffer.push(noteEvent);
                //                }
              } else
              {
                { // ベロシティ0 つまり Note Off
                  for (var k = 0; k < noteBuffer.length; ++k)
                  {
                    if (noteBuffer[k] && (noteBuffer[k].event.note == ev.parameter1) && (noteBuffer[k].channel == ev.midiChannel))
                    {
                      noteBuffer[k] = null;
                    }
                  }
                }
                step_bkp = step;
              }
              break;
            case 0xa: // Polyphonic Key Pressure
              songTrack.events.push(new MidiEvent(step, ev.midiChannel, new PolyphonicKeyPressure(ev.parameter1, ev.parameter2)));
              break;
            case 0xb: // Control Change
              switch (ev.parameter1)
              {
                case 0x07:
                  songTrack.events.push(new MidiEvent(step, ev.midiChannel, new MainVolume(ev.parameter2)));
                  break;
                case 0x0a:
                  songTrack.events.push(new MidiEvent(step, ev.midiChannel, new Panpot(ev.parameter2)));
                  break;
                case 0x5b:
                  songTrack.events.push(new MidiEvent(step, ev.midiChannel, new Reverb(ev.parameter2)));
                  break;
                case 0x5d:
                  songTrack.events.push(new MidiEvent(step, ev.midiChannel, new Chorus(ev.parameter2)));
                  break;
                case 0x5e:
                  songTrack.events.push(new MidiEvent(step, ev.midiChannel, new Variation(ev.parameter2)));
                  break;
                default:
                  songTrack.events.push(new MidiEvent(step, ev.midiChannel, new ControlChange(ev.parameter1, ev.parameter2)));
                  break;
              }
              break;
            case 0xc: // Program Change
              songTrack.events.push(new MidiEvent(step, ev.midiChannel, new ProgramChange(ev.parameter1)));
              break;
            case 0xd: // Channel Pressure
              songTrack.events.push(new MidiEvent(step, ev.midiChannel, new ChannelPressure(ev.parameter1)));
              break;
            case 0xe: // Pitch Bend

              songTrack.events.push(new MidiEvent(step, ev.midiChannel, new PitchBend(ev.parameter1 | ev.parameter2 << 7)));
              break;
          }
          break;
        case "sysex":
          songTrack.events.push(new MidiEvent(step, 0, new SysEx(ev.metaData)));
          break;
        case "meta":
          switch (ev.metaType)
          {
            case 0x00: // Sequence No.
              break;
            case 0x01: // Text
              for (var t = 0; t < ev.metaData.length; ++t)
              {
                song.comment += String.fromCharCode(ev.metaData[t]);
              }
              break;
            case 0x02: // 著作権表示
              for (var t = 0; t < ev.metaData.length; ++t)
              {
                song.copyright += String.fromCharCode(ev.metaData[t]);
              }
              break;
            case 0x2f: // End Of Track
              songTrack.events.push(new MidiEvent(step,0,new EndOfTrack(i)));
              if(stepMax > song.stepMax)
              {
                song.stepMax = stepMax;
              }
              break;
            case 0x51: // Set Tempo
              {
                var setTempo = new MidiEvent(step, 0, new SetTempo());
                setTempo.event.setQuarterNoteMicroSec((ev.metaData[0] << 16) + (ev.metaData[1] << 8) + (ev.metaData[2]));
                songTrack.events.push(setTempo);
              }
              break;
            default:
              songTrack.events.push(new MidiEvent(step, 0, new MetaEvent(ev.metaType, ev.metaData)));
              break;
          }
          break;
      } 
    }
  }
}

function dumpInfo(target)
{
  var str = "";
  for (var i = 0; i < song.tracks.length;++i )
  {
    str += "【Track " + i + " " + song.tracks[i].name + "】<br/>";
    var events = song.tracks[i].events;
    for(var j = 0;j < events.length;++j)
    {
      var s = events[j].toFormatStr();
      str += s + "<br/>";
    }
  }
  target.html(str);
}

function displayInfo(song)
{
  $('#info').html('');
  var select = $('<select>', { 'type': 'text', 'style': 'padding: 0;'})
  var outputs = sequencer.midiAccess.outputs;
  outputs.forEach(function (port, key) {
    $('<option>', { 'style': 'border:1px;padding 1px;' }).val(key).text(port.name).appendTo(select);
  });

  var table = $('<table>', { 'id': 'songinfo', 'class': 'table table-striped table-condensed' })
  .append($('<thead>').append($('<tr>').html('<th>Trk</th><th>Name</th><th id="allSelectPort"></th><th>Ch.</th><th>Volume</th><th>Panpot</th><th>Reverb</th><th>Chorus</th><th>Variation</th>')))
  .appendTo('#info');
  var tbody = $('<tbody>').appendTo('#songinfo');
  var allSelectPort = select.clone()
    .on('change', function (e)
    {
      var self = $(e.target);
      sequencer.setTrackOutputAll(parseInt(self.val()));
      for (var i = 0; i < song.tracks.length; ++i)
      {
        $('#output' + ('00' + i.toString()).slice(-2)).val(self.val());
      }
    }).appendTo('#allSelectPort');

  for(var i = 0;i < song.tracks.length;++i)
  {
    var row = $('<tr>',{'id':'track' + i});
    var track = song.tracks[i];

    var s = select.clone();
    s.attr('id','output' + ('00' + i.toString()).slice(-2) )
    .attr('trackNo', i.toString())
    .on('change', function (e)
    {
      var self = $(e.target);
      sequencer.setTrackOutput(parseInt(self.attr('trackNo')), parseInt(self.val()));
    });

    row
     .append($('<td>').text(i))
     .append($('<td>').text(track.name))
     .append($('<td>').append(s))
     .append($('<td>').text(track.channel))
     .append($('<td>').append($('<input>',
      { 'id': 'volume' + i,
        'type': 'text',
        'class': 'slider trackInfo',
        'data-slider-id': 'volumeSlider' + i,
        'data-slider-min': '0',
        'data-slider-max': '127',
        'data-slider-step': '1',
        'data-slider-value': '0',
        'data-slider-tooltip': 'show'
      }).on('slide', (function ()
      {
        var info = sequencer.trackInfos[i];
        return function(e)
        {
          console.log(info.output.name + ' ' + e.value);
          sendCC(info.output,7,e.value,info.channel);
        };
      })())
      )
     )
     .append($('<td>').append($('<input>',
      { 'id': 'panpot' + i,
        'type': 'text',
        'class': 'slider trackInfo',
        'data-slider-id': 'panpotSlider' + i,
        'data-slider-min': '0',
        'data-slider-max': '127',
        'data-slider-step': '1',
        'data-slider-value': '64',
        'data-slider-tooltip': 'show'
      }).on('slide', (function ()
      {
        var info = sequencer.trackInfos[i];
        return function(e)
        {
          console.log(info.output.name + ' ' + e.value);
          sendCC(info.output,0xa,e.value,info.channel);
        };
      })())
      )
     )
     .append($('<td>').append($('<input>',
      { 'id': 'reverb' + i,
        'type': 'text',
        'class': 'slider trackInfo',
        'data-slider-id': 'reverbSlider' + i,
        'data-slider-min': '0',
        'data-slider-max': '127',
        'data-slider-step': '1',
        'data-slider-value': '0',
        'data-slider-tooltip': 'show'
      }).on('slide', (function ()
      {
        var info = sequencer.trackInfos[i];
        return function(e)
        {
          console.log(info.output.name + ' ' + e.value);
          sendCC(info.output,0x5b,e.value,info.channel);
        };
      })())
      )
     )
     .append($('<td>').append($('<input>',
      { 'id': 'chorus' + i,
        'type': 'text',
        'class': 'slider trackInfo',
        'data-slider-id': 'chorusSlider' + i,
        'data-slider-min': '0',
        'data-slider-max': '127',
        'data-slider-step': '1',
        'data-slider-value': '0',
        'data-slider-tooltip': 'show'
      }).on('slide', (function ()
      {
        var info = sequencer.trackInfos[i];
        return function(e)
        {
          console.log(info.output.name + ' ' + e.value);
          sendCC(info.output,0x5d,e.value,info.channel);
        };
      })())
      )
     )
     .append($('<td>').append($('<input>',
      { 'id': 'variation' + i,
        'type': 'text',
        'class': 'slider trackInfo',
        'data-slider-id': 'variationSlider' + i,
        'data-slider-min': '0',
        'data-slider-max': '127',
        'data-slider-step': '1',
        'data-slider-value': '0',
        'data-slider-tooltip': 'show'
      }).on('slide', (function ()
      {
        var info = sequencer.trackInfos[i];
        return function(e)
        {
          console.log(info.output.name + ' ' + e.value);
          sendCC(info.output,0x5d,e.value,info.channel);
        };
      })())
      )
     )
     ;

     ;
//     .append($('<td>').append($('<canvas>',{'id':'trackData' + i,'height':'12px','width':'300px'})));
    tbody.append(row);
    $(sequencer.trackInfos[i]).on('volume', (function ()
    {
      var obj = $('#volume' + i);
      return function (e, volume)
      {
        obj.slider('setValue', volume);
      }
    })());

    $(sequencer.trackInfos[i]).on('panpot', (function ()
    {
      var obj = $('#panpot' + i);
      return function (e, volume)
      {
        obj.slider('setValue', volume);
      }
    })());

    $(sequencer.trackInfos[i]).on('variation', (function ()
    {
      var obj = $('#variation' + i);
      return function (e, volume)
      {
        obj.slider('setValue', volume);
      }
    })());

    $(sequencer.trackInfos[i]).on('reverb', (function ()
    {
      var obj = $('#reverb' + i);
      return function (e, volume)
      {
        obj.slider('setValue', volume);
      }
    })());

    $(sequencer.trackInfos[i]).on('chorus', (function ()
    {
      var obj = $('#chorus' + i);
      return function (e, volume)
      {
        obj.slider('setValue', volume);
      }
    })());


 //   $('#volume' + i)
;

  }

  $('input.slider').slider();
  $(sequencer).on('songPlaying', function (e, percent, time)
  {
    var totalSec = time / (1000);
    var minutes = Math.floor(totalSec / 60);
    var secs = Math.floor(totalSec % 60);
    var timeStr = ('00' + minutes.toString()).slice(-2) + ':' + ('00' + secs.toString()).slice(-2);
    $('#songProgress')
    .css('width', percent + '%')
    .text(timeStr);
    ;
  });

}

var sequencer = null;

$().ready(function ()
{
  var holder = $('#holder');
  if (navigator.requestMIDIAccess)
  {
    navigator.requestMIDIAccess({ sysex: true }).then
  (function (access)
  {
    //MIDIアクセス取得成功
    sequencer = new Sequencer(access);
    $(sequencer).on('tempoChange', function (e)
    {
      $('#tempo').val(e.target.tempo.bpm);
    });

    $(sequencer).on('ready', function ()
    {
      $('#start').removeAttr('disabled');
      $('#stop').attr('disabled', 'disabled');
    });

    $(sequencer).on('playing', function ()
    {
      $('#start').attr('disabled', 'disabled');
      $('#stop').removeAttr('disabled', 'disabled');
    });

    $(sequencer).on('stopped', function ()
    {
      $('#start').removeAttr('disabled');
      $('#stop').attr('disabled', 'disabled');
      $('#songProgress').css('width','0%').text('');
    });

    $(sequencer).on('init', function ()
    {
      $('#FileName').text('');
      $('#start').attr('disabled', 'disabled');
      $('#stop').attr('disabled', 'disabled');
    });


    if (window.File && window.FileReader)
    {
      holder.on('dragover', function () { $(this).addClass('hover'); $('#info').addClass('alert alert-info').html('ドロップしてください。'); return false; });
      holder.on('dragend', function () { $(this).removeClass('hover'); return false; });
      holder.on('dragleave', function () { $(this).removeClass('hover'); $('#info').addClass('alert alert-info').text('ファイルをドラッグ・ドロップしてください。'); return false; });
      holder.on('drop', function (e)
      {
        $('#info').addClass('alert alert-info').html('ファイルを読み込んでいます。');
        this.className = '';
        e.preventDefault();
        var file = e.originalEvent.dataTransfer.files[0],
            reader = new FileReader();
        reader.onload = function (event)
        {
          $(sequencer).trigger('init');
          var result = decodeSMF(event.target.result);
          if (!result.error)
          {
            parseSMF(midiFile);
            // $('#info').text("SMFファイル(" + file.name + ")を読み込みました。");
            $('#FileName').text(file.name);
            //dumpInfo($('#info'));
            sequencer.setSong(song);
            $('#info').removeClass('alert alert-info');
            displayInfo(song);
            //sequencer.play();
            // dumpFileInfo($('#info')[0]);
          } else
          {
            $('#info').text('');
            $('#info')
            .addClass('alert alert-danger alert-dismissable')
            .append($('<button>', { 'class': 'close', 'data-dismiss': 'alert', 'aria-hidden': 'true' })
              .on('click', function (e)
              {
                $('#info').removeClass('alert-danger alert-dismissable')
                .addClass('alert-info')
                .text('ここにSMFファイルをドラッグ・ドロップしてください。');

              }
              )
              .html('&times;')
            )
            .append($('<span>')
            .text('エラー：' + result.error)
            )
            ;
          }
        };
        reader.onerror = function (event)
        {
          $('#info').removeClass('alert alert-info');
          alert("Error: " + reader.error);
        };
        reader.readAsArrayBuffer(file);
        return false;
      });
    }

    $('#start').attr('disabled', 'disabled');
    $('#stop').attr('disabled', 'disabled');

    $('#variationSend').on('slide', function (e)
    {
      sendCC(0x5e, e.value);
    });

    $('#start').on('click', function (e)
    {
      sequencer.start();
      if (sequencer.status == "playing")
      {
        $('#start').attr('disabled', 'disabled');
        $('#stop').removeAttr('disabled');
      }
    });

    $('#stop').on('click', function (e)
    {
      sequencer.stop();
      if (sequencer.status == "stopped")
      {
        $('#start').removeAttr('disabled');
        $('#stop').attr('disabled', 'disabled');
      }
    });

    // Panic Button
    $('#resetAllController').on('click', function (event)
    {
      // check whether midi out is set or not
      panic();
      event.preventDefault();
    });


  },
    // MIDIAccess 取得失敗
  function (fail)
  {
    console.log('error ' + fail.name + ' ' + fail.message);
    alert('error ' + fail.name + ' ' + fail.message);
    $('#info').addClass('alert').addClass('alert-danger').text('お使いのブラウザではWebMIDI未対応かもしくは設定により実行できません。');
  });
  } else
  {
    $('#info').addClass('alert').addClass('alert-danger').text('お使いのブラウザではWebMIDI未対応のため実行できません。');
  }
});