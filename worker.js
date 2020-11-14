let throng = require('throng');
let Queue = require("bull");

let REDIS_URL = 'redis://redistogo:8b1ad55b3a4e4d5dfef12ceaaf4c9990@tetra.redistogo.com:9731/';

let workers = process.env.WEB_CONCURRENCY || 2;

let maxJobsPerWorker = 50;

function start() {
  let workQueue = new Queue('work', REDIS_URL);

  workQueue.process(maxJobsPerWorker,async (job,done) => {
    
  });
}
