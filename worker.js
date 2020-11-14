let throng = require('throng');
let Queue = require("bull");
let axios = require('axios')

let REDIS_URL = 'redis://redistogo:8b1ad55b3a4e4d5dfef12ceaaf4c9990@tetra.redistogo.com:9731/';

let workers = process.env.WEB_CONCURRENCY || 2;

let maxJobsPerWorker = 50;

function start() {
  let workQueue = new Queue('work', REDIS_URL);

  workQueue.process(maxJobsPerWorker,async (job,done) => {
    const queryParams = job.data
    console.log(job.data);
    
    if (!queryParams.acc || !queryParams.n || !queryParams.src) {
      done('some required params missing')
      return
    }
    const chunkSize = 262144
    let contentLength, contentType, uploadUrl, accessToken, uploaded = 0

    axios.head(queryParams.src).then(response => {
      contentType = response.headers['content-type'] || 'application/octet-stream'
      if (!response.headers['content-length']) {
        getAccessToken(streamedUpload)
        return
      }
      if (!response.headers['accept-ranges'] || response.headers['accept-ranges'] !== 'bytes') {
        getAccessToken(streamedUpload)
        return
      }
      else {
        contentLength = Number(response.headers['content-length'])
        getAccessToken(getChunk)
      }
    })

    function getAccessToken(cb) {
      let body = `redirect_uri=https://mytransbot.000webhostapp.com/4.php&client_id=83451151622-5o1fcje17b2fmmqfkma380pq6e251mjn.apps.googleusercontent.com&client_secret=dZ_-PdEXtWPM5m_C_0UpWSQB&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fdrive&grant_type=refresh_token&refresh_token=${Buffer.from(queryParams.acc, 'base64').toString('binary')}`;
      axios.post('https://oauth2.googleapis.com/token', body)
        .then(a => { accessToken = a.data.access_token; createDriveFile(cb) })
        .catch(a => { console.log('error while getting access token', a); done('error while getting access token'); return })
    }

    function createDriveFile(cb) {
      const options = {
        kind: 'drive#file',
        name: queryParams.n,
        mimeType: contentType
      }
      const headers = {
        Authorization: `Bearer ${accessToken}`
      }
      axios.post('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', options, { headers })
        .then(a => { uploadUrl = a.headers.location; cb() })
        .catch(a => { console.log('error while creating file', a); done('error while creating file'); return })
    }

    function getChunk() {
      let upperRange = uploaded + chunkSize < contentLength ? uploaded + chunkSize : contentLength + 1
      res.write(`--${upperRange}/${contentLength}--`)
      let headers = {}
      //only include range header if file larger than the chunk size
      if (contentLength > chunkSize) {
        headers.Range = `bytes=${uploaded}-${upperRange - 1}`
      }
      axios.get(queryParams.src, { headers, responseType: 'arraybuffer' }).then(uploadToDrive)
    }

    function uploadToDrive(chunkResponse) {
      //if file is larger than chunk, the last chunk must have a * as total bytes
      let contentRange = uploaded + chunkSize < contentLength ? `bytes ${uploaded}-${uploaded + chunkSize - 1}/${contentLength}` : `bytes ${uploaded}-${uploaded + contentLength - 1}/*`
      let headers = {
        'Content-Type': 'application/octet-stream',
        'Content-Range': contentRange
      }
      //if file is smaller than the chuck size, content range must not be included
      if (!uploaded && contentLength <= chunkSize) {
        delete headers['Content-Range']
      }
      axios.put(uploadUrl, chunkResponse.data, { headers })
        .then(a => { done(`<script>function gf(){fetch('https://www.googleapis.com/drive/v3/files/${a.data.id}?alt=media',{headers:{Authorization:'Bearer ${accessToken}'}}).then(a=>{a.blob().then(b=>{window.location=URL.createObjectURL(b)})})}</script><button style="background-color: lightgreen;width:25%;height:10%;margin-left:25%;margin-top:5%" onclick="gf()">Download File</button>`) })
        .catch(response => {
          if (response.request.res.statusCode === 308) {
            uploaded = Number(response.request.res.headers.range.split('-')[1]) + 1
            getChunk()
          }
          else { console.log('uploading-error', response.response.data); done('uploading-error'); return }
        })
    }

    function streamedUpload() {
      axios.get(queryParams.src, { responseType: 'stream' })
        .then(handleStream)
        .catch(a => { console.log(a); done('error') })

      let body = Buffer.alloc(0)

      function handleStream(response) {
        response.data.on('data', data => {
          response.data.pause()
          body = Buffer.concat([body, data])
          if (body.length > chunkSize) {
            res.write('uploading')
            let chunk = body.subarray(0, chunkSize)
            body = body.subarray(chunkSize)
            let headers = {
              'Content-Type': 'application/octet-stream',
              'Content-Range': `bytes ${uploaded}-${(uploaded + chunk.length) - 1}/*`
            }
            uploaded += chunk.length
            axios.put(uploadUrl, chunk, { headers })
              .then(a => { response.data.resume() })
              .catch(response2 => {
                if (response2.response.status >= 400) {
                  console.log('uploading-error', response2.response);
                  done('uploading-error');
                  return
                }
                else response.data.resume()
              })
          }
          else response.data.resume()
        })

        response.data.on('end', () => {
          if (body.length > 0) {
            let headers = {
              'Content-Type': 'application/octet-stream',
              'Content-Range': `bytes ${uploaded}-${(uploaded + body.length) - 1}/${(uploaded + body.length)}`
            }
            uploaded += body.length
            axios.put(uploadUrl, body, { headers })
              .then(a => { done(`<script>function gf(){fetch('https://www.googleapis.com/drive/v3/files/${a.data.id}?alt=media',{headers:{Authorization:'Bearer ${accessToken}'}}).then(a=>{a.blob().then(b=>{window.location=URL.createObjectURL(b)})})}</script><button style="background-color: lightgreen;width:25%;height:10%;margin-left:25%;margin-top:5%" onclick="gf()">Download File</button>`) })
              .catch(response2 => {
                if (response2.response.status >= 400) {
                  console.log('uploading-error', response2.response);
                  done('uploading-error');
                  return
                }
              })
          }
          else done('finished')
        })
      }
    }
  });
}

throng({ workers, start });
