'use strict'

const fs = require('fs')
const { execSync } = require('child-process')
const path = require('path')
const FFMPEG = require('ffmpeg')
const ffmpegProbe = require('ffmpeg-probe')

const concat = require('.')

module.exports = async (opts) => {
  const {
    log,
    index,
    videos,
    transition,
    transitions,
    frameFormat,
    outputDir
  } = opts

  
}

function convertMStoTimestamp (ms) {
  try {
    let miliseconds, seconds, minutes, hours
    seconds = Math.floor((ms / 1000) % 60)
    minutes = Math.floor((ms / (1000 * 60)) % 60)
    hours = Math.floor((ms / (1000 * 60 * 60)) % 24)
    miliseconds = parseFloat(`.${ms}`).toFixed(3).toString().substring(1)

    seconds = seconds < 10 ? seconds = '0' + seconds : seconds.toString()
    minutes = minutes < 10 ? minutes = '0' + minutes : minutes.toString()
    hours = hours < 10 ? hours = '0' + hours : hours.toString()
    return `${hours}:${minutes}:${seconds}${miliseconds}`
  } catch (e) {
    console.error(e)
    throw e
  }
}

function getVideoFile (filepath) {
  return new Promise(function (resolve, reject) {
    try {
      filepath = path.isAbsolute(filepath) ? filepath : path.resolve(filepath)
      if (!fs.existsSync(filepath)) {
        return reject(new Error(`Filepath ${filepath} does not exist`))
      }

      let vid = new FFMPEG(filepath)
      vid.then(file => {
        return resolve(file)
      }).catch(e => {
        console.error(`error getting video file via ffmpeg: ${e}`)
        return reject(e)
      })
    } catch (e) {
      console.error(e)
      return reject(e)
    }
  })
}

async function createCopyChunks1 (opts) {
  const {
    log = console.log,
    videos = [],
    transition,
    transitions = [],
    frameFormat = undefined,
    outputDir
  } = opts

  let baseFragments = []
  let transitionFragments = []
  for (let i in videos) {
    let videoPath = videos[i]
    let video = await getVideoFile(videoPath)

    let curTransition = transitions.length > 0 ? transitions[i] : transition

    let probe = ffmpegProbe(video)
    let duration = probe.duration
    let ext = path.extname(videoPath)

    let cutMiliseconds, startMiliseconds, beginTimestamp, durationTimestamp, output
    switch (i) {
      case '0':
        // Create the base video
        cutMiliseconds = duration - curTransition.duration
        durationTimestamp = convertMStoTimestamp(cutMiliseconds)
        output = path.join(outputDir, `0${ext}`)
        baseFragments.push(await createCopy(video, '00:00:00', durationTimestamp, output))

        // Create the fragment that needs an outro transition
        startMiliseconds = cutMiliseconds
        beginTimestamp = convertMStoTimestamp(startMiliseconds)
        output = path.join(outputDir, `0.end${ext}`)
        transitionFragments.push(await createCopy(video, beginTimestamp, null, output))
        break
      case (videos.length - 1):
        // Create the base video
        startMiliseconds = curTransition.duration
        beginTimestamp = convertMStoTimestamp(startMiliseconds)
        output = path.join(outputDir, `${i}${ext}`)
        baseFragments.push(await createCopy(video, beginTimestamp, probe.duration - curTransition.duration, output))

        // Create the fragment that needs an opening transition
        cutMiliseconds = startMiliseconds
        durationTimestamp = convertMStoTimestamp(cutMiliseconds)
        output = path.join(outputDir, `${i}.begin${ext}`)
        transitionFragments.push(await createCopy, null, durationTimestamp, output)
        break
      default:
        // Create the base video
        startMiliseconds = curTransition.duration
        beginTimestamp = convertMStoTimestamp(startMiliseconds)
        cutMiliseconds = probe.duration - (curTransition.duration * 2) // times two for the opening fragment
        durationTimestamp = convertMStoTimestamp(cutMiliseconds)
        output = path.join(outputDir, `${i}${ext}`)
        baseFragments.push(await createCopy(video, beginTimestamp, probe.duration - curTransition.duration, output))

        // Create the fragment that needs an opening transition
        durationTimestamp = convertMStoTimestamp(startMiliseconds)
        output = path.join(outputDir, `${i}.begin${ext}`)
        transitionFragments.push(await createCopy(video, null, durationTimestamp, output))

        // Create the fragment the needs an outro transition
        beginTimestamp = convertMStoTimestamp(cutMiliseconds)
        output = path.join(outputDir, `${i}.end${ext}`)
        transitionFragments.push(await createCopy(video, beginTimestamp, null, output))

        break
    }
  }

  transitionFragments.sort()
  let transitionMappings = []
  let curTransition = { begin: null, end: null, output: null }
  for (let i = 0; i < transitionFragments.length; i++) {
    if (!curTransition.begin && !curTransition.end) {
      curTransition.end = transitionFragments[i]
    } else if (curTransition.begin && !curTransition.end) {
      curTransition.begin = transitionFragments[i]
      transitionMappings.push(curTransition)
      curTransition = { begin: null, end: null, output: null }
    } else {
      throw new Error('unexpected error occured while mapping transition fragments')
    }
  }

  let transitionVideoFiles = []
  await Promise.all(transitionMappings.map(async (mapping) => {
    let newOpts = opts
    newOpts.videos = [mapping.end, mapping.begin]
    newOpts.output = path.join(outputDir, `${path.basename(mapping.end, path.extname(mapping.end))}-${path.basename(mapping.begin, path.extname(mapping.begin))}${path.extname(mapping.begin)}`)
    await concat(newOpts)
    transitionVideoFiles.push(newOpts.output)
  }))

  let concatVideoFiles = []
  for (var i = 0; i < transitionVideoFiles.length; i++) {
    concatVideoFiles.push(baseFragments[i])
    concatVideoFiles.push(transitionVideoFiles[i])
  }

  let fileContent = ''
  concatVideoFiles.forEach(file => {
    fileContent += `file ${file}`
  })
  let concatFilepath = path.join(outputDir, 'concat.txt')
  fs.writeFileSync(concatFilepath, fileContent)

  let cmd = `ffmpeg -f concat -safe 0 -i ${concatFilepath} -c copy output`
  let results = execSync(cmd)
  console.log(results)
}

async function createFragments (opts) {
    const {
        log = console.log,
        videos = [],
        transition,
        transitions = [],
        frameFormat = undefined,
        outputDir
      } = opts

      
}

async function createBaseFile (opts) {
  const {
    log,
    outputDir,
    transition,
    videoPath,
    index,
    isFirst = false,
    isLast = false
  } = opts

  let video = await getVideoFile(videoPath)

  let probe = ffmpegProbe(video)
  let duration = probe.duration
  let ext = path.extname(video)

  let cutMiliseconds, startMiliseconds, beginTimestamp, durationTimestamp, output
  try {
    if (isFirst) {
      cutMiliseconds = duration - transition.duration
      durationTimestamp = convertMStoTimestamp(cutMiliseconds)
      output = path.join(outputDir, `0${ext}`)
      return await createCopy(video, '00:00:00', durationTimestamp, output)
    } else if (isLast) {
      startMiliseconds = transition.duration
      beginTimestamp = convertMStoTimestamp(startMiliseconds)
      output = path.join(outputDir, `${index}${ext}`)
      return await createCopy(video, beginTimestamp, probe.duration - transition.duration, output)
    } else {
      startMiliseconds = transition.duration
      beginTimestamp = convertMStoTimestamp(startMiliseconds)
      cutMiliseconds = probe.duration - (transition.duration * 2) // times two for the opening and closing fragments gone
      durationTimestamp = convertMStoTimestamp(cutMiliseconds)
      output = path.join(outputDir, `${index}${ext}`)
      return await createCopy(video, beginTimestamp, probe.duration - transition.duration, output)
    }
  } catch (e) {
    log(`error creating base file: ${e}`)
    throw e
  }
}

async function createBeginFile (opts) {
  const {
    log,
    outputDir,
    transition,
    videoPath,
    index,
    isFirst = false,
    isLast = false
  } = opts

  let video = await getVideoFile(videoPath)

  let probe = ffmpegProbe(video)
  let duration = probe.duration
  let ext = path.extname(video)

  let cutMiliseconds, startMiliseconds, beginTimestamp, durationTimestamp, output
  try {
    if (isFirst) {

    } else if (isLast) {

    } else {

    }
  } catch (e) {
    console.error(e)
    throw e
  }
}

async function createEndFile (opts) {
  const {
    log,
    outputDir,
    transition,
    videoPath,
    index,
    isFirst = false,
    isLast = false
  } = opts

  let video = await getVideoFile(videoPath)

  let probe = ffmpegProbe(video)
  let duration = probe.duration
  let ext = path.extname(video)

  let cutMiliseconds, startMiliseconds, beginTimestamp, durationTimestamp, output
  try {
    if (isFirst) {

    } else if (isLast) {

    } else {
      
    }
  } catch (e) {
    console.error(e)
    throw e
  }
}

function createCopy (video, startTimestamp, durationTimestamp, output) {
  return new Promise(function (resolve, reject) {
    video
      .setAudioCodec('copy')
      .setVideoCodec('copy')
      .setVideoStartTime(startTimestamp)
      .setVideoDuration(durationTimestamp)
      .save(output, function (err, file) {
        if (err) {
          return reject(new Error(`error creating copy: ${err}`))
        }
        return resolve(file)
      })
  })
}
