let express = require('express');
let Queue = require('bull');

// Serve on PORT on Heroku and on localhost:5000 locally
let PORT = process.env.PORT || '5000';
// Connect to a local redis intance locally, and the Heroku-provided URL in production
let REDIS_URL = 'redis://redistogo:8b1ad55b3a4e4d5dfef12ceaaf4c9990@tetra.redistogo.com:9731/';

let app = express();

// Create / Connect to a named work queue
let workQueue = new Queue('work', REDIS_URL);

// Serve the two static assets
app.get('/', (req, res) => res.sendFile('index.html', { root: __dirname }))
app.get('/client.js', (req, res) => res.sendFile('client.js', { root: __dirname }));

// Kick off a new job by adding it to the work queue
app.post('/job', async (req, res) => {
  // This would be where you could pass arguments to the job
  // Ex: workQueue.add({ url: 'https://www.heroku.com' })
  // Docs: https://github.com/OptimalBits/bull/blob/develop/REFERENCE.md#queueadd
  let job = await workQueue.add({acc:"MS8vMGZLeFZDSUMxV1dxckNnWUlBUkFBR0E4U05nRi1MOUlyeVZuVFZpc1pCU3ozbF9yZjlHNTJrYlFNV0ZOSzNYVmlNVnhJME5sSUlhVi1uX2hybVJ4Z09ZYmVXaWJlTEExUDRB",n:'123.mp4',src:'https://ntgfgg.bl.files.1drv.com/y4msXW3ioKZZ1CjvlmAKohE42o2UvLYdYv-0h2_Di_gfQrQGKt4cSt19DH9_ds3rw3vAH4WFI9e3-IJNmLgA0OS5Ultk3Xy0D0nyae-UjmZv2Sf31XAgj9MsJVhh7_UvL39rQLdc-UtBrhHOACWaYKccOur3G3fxEpN-pmGINFZVrixsyVGyTTSwmqFAhA_BeZHLcyUYN7OR12k0BLmKlMbFQ'});
  res.json({ id: job.id });
});

// Allows the client to query the state of a background job
app.get('/job/:id', async (req, res) => {
  let id = req.params.id;
  let job = await workQueue.getJob(id);

  if (job === null) {
    res.status(404).end();
  } else {
    let state = await job.getState();
    let progress = job._progress;
    let reason = job.failedReason;
    res.json({ id, state, progress, reason });
  }
});

// You can listen to global events to get notified when jobs are processed
workQueue.on('global:completed', (jobId, result) => {
  console.log(`Job completed with result ${result}`);
});

app.listen(PORT, () => console.log("Server started!"));
