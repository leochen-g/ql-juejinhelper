/*
  cron 58 6 * * * juejin_seagold.js
  掘金社区
  更新时间: 2022-10-24
  活动入口：https://juejin.cn/game/haidijuejin/
  只支持Node.js
  脚本兼容: Node.js
  ***********************************************************
  感谢原作者 iDerekLi https://github.com/iDerekLi/juejin-helper
 */

const $ = new Env('掘金-海底掘金');
const notify = $.isNode() ? require('./sendNotify') : '';
const JuejinHelper = require("juejin-helper");
const {Grid, Astar} = require("fast-astar");
const jjCookieNode = $.isNode() ? require('./juejinCookies.js') : '';
let cookiesArr = []
if ($.isNode()) {
  Object.keys(jjCookieNode).forEach((item) => {
    cookiesArr.push(jjCookieNode[item]);
  });
}
function randomRangeNumber(start = 500, end = 1000) {
  return (Math.random() * (end - start) + start) >> 0;
}

class Juejin_seagold {
  gameApi = null;
  cookie = "";

  constructor(cookie) {
    this.cookie = cookie;
  }

  nodeRules = [
    {code: 0, hasBounty: false, isWall: false, name: "空地"},
    {code: 2, hasBounty: true, isWall: false, name: "矿石", isBest: true},
    {code: 3, hasBounty: false, isWall: false, name: "星星"},
    {code: 4, hasBounty: false, isWall: true, name: "贝壳"},
    {code: 5, hasBounty: false, isWall: true, name: "水母"},
    {code: 6, hasBounty: false, isWall: true, name: "石头"},
    {code: 10, hasBounty: true, isWall: false, name: "上指令"},
    {code: 11, hasBounty: true, isWall: false, name: "下指令"},
    {code: 12, hasBounty: true, isWall: false, name: "左指令"},
    {code: 13, hasBounty: true, isWall: false, name: "右指令"},
    {code: 14, hasBounty: true, isWall: false, name: "跳跃指令"},
    {code: 15, hasBounty: true, isWall: false, name: "循环指令"}
  ];

  debug = false;
  userInfo = {
    uid: "",
    name: "",
    todayDiamond: 0, // 今日获取矿石数
    todayLimitDiamond: 1500, // 今日限制获取矿石数
    maxTodayDiamond: 0 // 今日最大矿石数
  };

  gameInfo = {
    gameId: "",
    mapData: [],
    curPos: {x: 0, y: 0},
    blockData: {
      moveUp: 0,
      moveDown: 0,
      moveLeft: 0,
      moveRight: 0,
      jump: 0,
      loop: 0
    },
    gameDiamond: 0
  };

  history = [];

  get isGaming() {
    return this.gameInfo && this.gameInfo.gameId !== "";
  }

  resetGame() {
    this.gameInfo = {
      gameId: "",
      mapData: [],
      curPos: {x: 0, y: 0},
      blockData: {
        moveUp: 0,
        moveDown: 0,
        moveLeft: 0,
        moveRight: 0,
        jump: 0,
        loop: 0
      },
      gameDiamond: 0
    };
  }

  restoreGame(gameInfo) {
    this.gameInfo = {
      gameId: gameInfo.gameId,
      mapData: this.makeMap(gameInfo.mapData, 6),
      curPos: gameInfo.curPos,
      blockData: gameInfo.blockData,
      gameDiamond: gameInfo.gameDiamond
    };
  }

  async gameStart() {
    if (this.isGaming) return;
    const roleId = Math.ceil(Math.random() * 3);
    const gameInfo = await this.gameApi.gameStart({roleId});

    this.gameInfo = {
      roleId,
      gameId: gameInfo.gameId,
      mapData: this.makeMap(gameInfo.mapData, 6),
      curPos: gameInfo.curPos,
      blockData: gameInfo.blockData,
      gameDiamond: 0
    };
  }

  async gameOver() {
    if (!this.isGaming) return;
    const gameOverInfo = await this.gameApi.gameOver();
    this.userInfo.todayDiamond = gameOverInfo.todayDiamond;
    this.userInfo.todayLimitDiamond = gameOverInfo.todayLimitDiamond;

    this.history.push({
      gameId: this.gameInfo.gameId,
      gameDiamond: gameOverInfo.gameDiamond,
      realDiamond: gameOverInfo.realDiamond,
      todayDiamond: gameOverInfo.todayDiamond,
      todayLimitDiamond: gameOverInfo.todayLimitDiamond
    });

    this.resetGame();

    return gameOverInfo;
  }

  async executeGameCommand() {
    const bmmap = this.getBMMap();
    const curNode = this.getNode(this.gameInfo.curPos);
    const bestNode = this.getBestNode(bmmap);
    const path = this.getRoutePath(bmmap, curNode, bestNode);
    if (!Array.isArray(path)) {
      throw new Error(
        `路径 ${JSON.stringify(path)} 无法在地图 ${JSON.stringify(this.getMaze(bmmap))} 行进.`
      );
    }
    const commands = this.getCommands(path);
    if (commands.length <= 0) {
      return false;
    }
    const gameCommandInfo = await this.gameApi.gameCommand(this.gameInfo.gameId, commands);
    this.gameInfo.curPos = gameCommandInfo.curPos;
    this.gameInfo.blockData = gameCommandInfo.blockData;
    this.gameInfo.gameDiamond = gameCommandInfo.gameDiamond;

    return true;
  }

  getCommand(start, end) {
    const [sx, sy] = start;
    const [ex, ey] = end;

    if (sx === ex && sy !== ey) {
      return sy > ey ? "U" : "D";
    }

    if (sy === ey && sx !== ex) {
      return sx > ex ? "L" : "R";
    }

    return null;
  }

  getCommands(path) {
    const commands = [];
    for (let i = 0; i < path.length - 1; i++) {
      const cmd = this.getCommand(path[i], path[i + 1]);
      if (!cmd) {
        throw new Error(`路径错误: ${i}->${i + 1}`);
      }
      commands.push(cmd);
    }
    return commands;
  }

  getNodePosition(map, node) {
    for (let y = 0; y < map.length; y++) {
      const list = map[y];
      for (let x = 0; x < list.length; x++) {
        const cNode = list[x];
        if (cNode === node) {
          return {x, y};
        }
      }
    }
    return {x: 0, y: 0};
  }

  getRoutePath(map, startNode, endNode) {
    const maze = this.generateMapMaze(map);
    const startPos = this.getNodePosition(map, startNode);
    const endPos = this.getNodePosition(map, endNode);

    if (this.debug) {
      console.log("地图", this.getMaze(map));
      console.log("开始位置", startPos);
      console.log("结束位置", endPos);
    }

    const astar = new Astar(maze);
    const path = astar.search([startPos.x, startPos.y], [endPos.x, endPos.y], {
      rightAngle: true,
      optimalResult: true
    });

    return path;
  }

  makeMap(mapData, grid = 6) {
    const map = [];
    for (let i = 0, y = 0; i < mapData.length; i += grid, y++) {
      const row = [];
      map.push(row);
      for (let x = 0; x < grid; x++) {
        const cell = mapData[i + x];
        row.push(this.createMapNode(x, y, cell));
      }
    }
    return map;
  }

  createMapNode(x, y, secret) {
    const rule = this.getNodeRule(secret);
    return {
      code: rule.code,
      bounty: rule.hasBounty ? this.getBounty(secret, rule.code) : 0,
      x,
      y,
      isWall: rule.isWall,
      isBest: !!rule.isBest
    };
  }

  // 获取范围地图
  getBMMap() {
    const {mapData, blockData, curPos} = this.gameInfo;
    const minX = Math.max(curPos.x - blockData.moveLeft, 0);
    const maxX = Math.min(curPos.x + blockData.moveRight, mapData[0].length - 1);
    const minY = Math.max(curPos.y - blockData.moveUp, 0);
    const maxY = Math.min(curPos.y + blockData.moveDown, mapData.length - 1);

    const map = [];
    for (let y = minY; y <= maxY; y++) {
      const row = [];
      map.push(row);
      for (let x = minX; x <= maxX; x++) {
        row.push(mapData[y][x]);
      }
    }

    return map;
  }

  getNode(pos) {
    return this.gameInfo.mapData[pos.y][pos.x];
  }

  getBestNode(map) {
    let bestNode = null;
    map.forEach((row) => {
      row.forEach((node) => {
        if (node.isBest && bestNode === null) {
          bestNode = node;
        } else if (node.isBest && node.bounty > bestNode.bounty) {
          bestNode = node;
        }
      });
    });
    return bestNode;
  }

  getMaze(map) {
    return map.map((row, y) => {
      return row.map((node, x) => {
        if (node.isWall) {
          return 1;
        } else {
          return 0;
        }
      });
    });
  }

  // 生成迷宫
  generateMapMaze(map) {
    const grid = new Grid({
      col: map[0].length,
      row: map.length
    });

    map.forEach((row, y) => {
      row.forEach((node, x) => {
        if (node.isWall) {
          grid.set([x, y], "value", 1);
        }
      });
    });

    return grid;
  }

  getNodeRule(secret) {
    return this.nodeRules.find((rule) => {
      const reg = new RegExp(`^${rule.code}`);
      return reg.test(secret);
    });
  }

  getBounty(secret, key) {
    const reg = new RegExp(`^${key}([0-9]*)`);
    const match = secret.toString().match(reg);
    if (match) {
      const materials = Number.parseInt(match[1]);
      return !isNaN(materials) ? materials : 0;
    }
    return 0;
  }

  async run() {
    const juejin = new JuejinHelper();
    await juejin.login(this.cookie);
    this.gameApi = juejin.seagold();

    const loginInfo = await this.gameApi.gameLogin();
    if (!loginInfo.isAuth) {
      throw Error(`掘友 ${loginInfo.name} 未授权, 请前往掘金授权!`);
    }

    const info = await this.gameApi.gameInfo();
    this.userInfo = {
      uid: info.userInfo.uid,
      name: info.userInfo.name,
      todayDiamond: info.userInfo.todayDiamond,
      todayLimitDiamond: info.userInfo.todayLimitDiamond,
      maxTodayDiamond: info.userInfo.maxTodayDiamond
    };

    const runEndTime = new Date();
    runEndTime.setMinutes(runEndTime.getMinutes() + 30);
    let runTime = new Date();

    const runGame = async () => {
      if (this.isGaming) {
        return await this.gameOver();
      }

      await this.gameStart();

      while (await this.executeGameCommand()) {
        await $.wait(randomRangeNumber(1000, 1500));

        if (runTime >= runEndTime) {
          throw Error(`掘金游戏异常: 服务运行时间过长.`);
        }

        runTime = new Date();
      }

      return await this.gameOver();
    };

    const maxZeroCount = 5;
    let zeroCount = 0;

    if (info.gameStatus === 1) {
      this.restoreGame(info.gameInfo);
      await runGame();
    } else {
      this.resetGame();
    }

    while (this.userInfo.todayDiamond < this.userInfo.todayLimitDiamond) {
      if (runTime >= runEndTime) {
        throw Error(`掘金游戏异常: 服务运行时间过长.`);
      }

      if (zeroCount > maxZeroCount) {
        throw new Error("掘金游戏异常: 您 0 矿石游戏对局次数过多.");
      }

      await $.wait(randomRangeNumber(1000, 5000));
      const gameOverInfo = await runGame();

      if (gameOverInfo.gameDiamond === 0) {
        zeroCount++;
      }

      runTime = new Date();
    }

    await juejin.logout();
  }

  toString() {
    const userInfo = this.userInfo;
    const gameLives = this.history
      .map((game) => `${game.gameId}\n  挖取 ${game.gameDiamond}\n  获得 ${game.realDiamond}`)
      .join("\n");

    return `
掘友: ${userInfo.name}
今日限制矿石数 ${userInfo.todayLimitDiamond}
${
  userInfo.todayDiamond < userInfo.todayLimitDiamond
    ? `今日获取矿石数 ${userInfo.todayDiamond}`
    : "今日获取已达上限"
}
${this.history.length ? `\n游戏记录\n${gameLives}` : ""}
`.trim();
  }
}

!(async ()=> {
  if (!cookiesArr[0]) {
    $.msg($.name, '【提示】请先获取掘金账号一cookie');
    return;
  }
  const messageList = [];
  for (let cookie of cookiesArr) {
    const seaGold = new Juejin_seagold(cookie);
    await $.wait(randomRangeNumber(1000, 5000)); // 初始等待1-5s
    await seaGold.run();
    const content = seaGold.toString();
    console.log(content);
    messageList.push(content);
  }
  const message = messageList.join(`\n${"-".repeat(15)}\n`);
  await notify.sendNotify("掘金-海底掘金", message);
})().catch((e)=> {
  $.log('', `❌ ${$.name}, 失败! 原因: ${e}!`, '')
  notify.sendNotify("掘金-海底掘金-失败", e.message);
}).finally(() => {
  $.done();
})

// prettier-ignore
function Env(t,e){"undefined"!=typeof process&&JSON.stringify(process.env).indexOf("GITHUB")>-1&&process.exit(0);class s{constructor(t){this.env=t}send(t,e="GET"){t="string"==typeof t?{url:t}:t;let s=this.get;return"POST"===e&&(s=this.post),new Promise((e,i)=>{s.call(this,t,(t,s,r)=>{t?i(t):e(s)})})}get(t){return this.send.call(this.env,t)}post(t){return this.send.call(this.env,t,"POST")}}return new class{constructor(t,e){this.name=t,this.http=new s(this),this.data=null,this.dataFile="box.dat",this.logs=[],this.isMute=!1,this.isNeedRewrite=!1,this.logSeparator="\n",this.startTime=(new Date).getTime(),Object.assign(this,e),this.log("",`🔔${this.name}, 开始!`)}isNode(){return"undefined"!=typeof module&&!!module.exports}isQuanX(){return"undefined"!=typeof $task}isSurge(){return"undefined"!=typeof $httpClient&&"undefined"==typeof $loon}isLoon(){return"undefined"!=typeof $loon}toObj(t,e=null){try{return JSON.parse(t)}catch{return e}}toStr(t,e=null){try{return JSON.stringify(t)}catch{return e}}getjson(t,e){let s=e;const i=this.getdata(t);if(i)try{s=JSON.parse(this.getdata(t))}catch{}return s}setjson(t,e){try{return this.setdata(JSON.stringify(t),e)}catch{return!1}}getScript(t){return new Promise(e=>{this.get({url:t},(t,s,i)=>e(i))})}runScript(t,e){return new Promise(s=>{let i=this.getdata("@chavy_boxjs_userCfgs.httpapi");i=i?i.replace(/\n/g,"").trim():i;let r=this.getdata("@chavy_boxjs_userCfgs.httpapi_timeout");r=r?1*r:20,r=e&&e.timeout?e.timeout:r;const[o,h]=i.split("@"),n={url:`http://${h}/v1/scripting/evaluate`,body:{script_text:t,mock_type:"cron",timeout:r},headers:{"X-Key":o,Accept:"*/*"}};this.post(n,(t,e,i)=>s(i))}).catch(t=>this.logErr(t))}loaddata(){if(!this.isNode())return{};{this.fs=this.fs?this.fs:require("fs"),this.path=this.path?this.path:require("path");const t=this.path.resolve(this.dataFile),e=this.path.resolve(process.cwd(),this.dataFile),s=this.fs.existsSync(t),i=!s&&this.fs.existsSync(e);if(!s&&!i)return{};{const i=s?t:e;try{return JSON.parse(this.fs.readFileSync(i))}catch(t){return{}}}}}writedata(){if(this.isNode()){this.fs=this.fs?this.fs:require("fs"),this.path=this.path?this.path:require("path");const t=this.path.resolve(this.dataFile),e=this.path.resolve(process.cwd(),this.dataFile),s=this.fs.existsSync(t),i=!s&&this.fs.existsSync(e),r=JSON.stringify(this.data);s?this.fs.writeFileSync(t,r):i?this.fs.writeFileSync(e,r):this.fs.writeFileSync(t,r)}}lodash_get(t,e,s){const i=e.replace(/\[(\d+)\]/g,".$1").split(".");let r=t;for(const t of i)if(r=Object(r)[t],void 0===r)return s;return r}lodash_set(t,e,s){return Object(t)!==t?t:(Array.isArray(e)||(e=e.toString().match(/[^.[\]]+/g)||[]),e.slice(0,-1).reduce((t,s,i)=>Object(t[s])===t[s]?t[s]:t[s]=Math.abs(e[i+1])>>0==+e[i+1]?[]:{},t)[e[e.length-1]]=s,t)}getdata(t){let e=this.getval(t);if(/^@/.test(t)){const[,s,i]=/^@(.*?)\.(.*?)$/.exec(t),r=s?this.getval(s):"";if(r)try{const t=JSON.parse(r);e=t?this.lodash_get(t,i,""):e}catch(t){e=""}}return e}setdata(t,e){let s=!1;if(/^@/.test(e)){const[,i,r]=/^@(.*?)\.(.*?)$/.exec(e),o=this.getval(i),h=i?"null"===o?null:o||"{}":"{}";try{const e=JSON.parse(h);this.lodash_set(e,r,t),s=this.setval(JSON.stringify(e),i)}catch(e){const o={};this.lodash_set(o,r,t),s=this.setval(JSON.stringify(o),i)}}else s=this.setval(t,e);return s}getval(t){return this.isSurge()||this.isLoon()?$persistentStore.read(t):this.isQuanX()?$prefs.valueForKey(t):this.isNode()?(this.data=this.loaddata(),this.data[t]):this.data&&this.data[t]||null}setval(t,e){return this.isSurge()||this.isLoon()?$persistentStore.write(t,e):this.isQuanX()?$prefs.setValueForKey(t,e):this.isNode()?(this.data=this.loaddata(),this.data[e]=t,this.writedata(),!0):this.data&&this.data[e]||null}initGotEnv(t){this.got=this.got?this.got:require("got"),this.cktough=this.cktough?this.cktough:require("tough-cookie"),this.ckjar=this.ckjar?this.ckjar:new this.cktough.CookieJar,t&&(t.headers=t.headers?t.headers:{},void 0===t.headers.Cookie&&void 0===t.cookieJar&&(t.cookieJar=this.ckjar))}get(t,e=(()=>{})){t.headers&&(delete t.headers["Content-Type"],delete t.headers["Content-Length"]),this.isSurge()||this.isLoon()?(this.isSurge()&&this.isNeedRewrite&&(t.headers=t.headers||{},Object.assign(t.headers,{"X-Surge-Skip-Scripting":!1})),$httpClient.get(t,(t,s,i)=>{!t&&s&&(s.body=i,s.statusCode=s.status),e(t,s,i)})):this.isQuanX()?(this.isNeedRewrite&&(t.opts=t.opts||{},Object.assign(t.opts,{hints:!1})),$task.fetch(t).then(t=>{const{statusCode:s,statusCode:i,headers:r,body:o}=t;e(null,{status:s,statusCode:i,headers:r,body:o},o)},t=>e(t))):this.isNode()&&(this.initGotEnv(t),this.got(t).on("redirect",(t,e)=>{try{if(t.headers["set-cookie"]){const s=t.headers["set-cookie"].map(this.cktough.Cookie.parse).toString();s&&this.ckjar.setCookieSync(s,null),e.cookieJar=this.ckjar}}catch(t){this.logErr(t)}}).then(t=>{const{statusCode:s,statusCode:i,headers:r,body:o}=t;e(null,{status:s,statusCode:i,headers:r,body:o},o)},t=>{const{message:s,response:i}=t;e(s,i,i&&i.body)}))}post(t,e=(()=>{})){if(t.body&&t.headers&&!t.headers["Content-Type"]&&(t.headers["Content-Type"]="application/x-www-form-urlencoded"),t.headers&&delete t.headers["Content-Length"],this.isSurge()||this.isLoon())this.isSurge()&&this.isNeedRewrite&&(t.headers=t.headers||{},Object.assign(t.headers,{"X-Surge-Skip-Scripting":!1})),$httpClient.post(t,(t,s,i)=>{!t&&s&&(s.body=i,s.statusCode=s.status),e(t,s,i)});else if(this.isQuanX())t.method="POST",this.isNeedRewrite&&(t.opts=t.opts||{},Object.assign(t.opts,{hints:!1})),$task.fetch(t).then(t=>{const{statusCode:s,statusCode:i,headers:r,body:o}=t;e(null,{status:s,statusCode:i,headers:r,body:o},o)},t=>e(t));else if(this.isNode()){this.initGotEnv(t);const{url:s,...i}=t;this.got.post(s,i).then(t=>{const{statusCode:s,statusCode:i,headers:r,body:o}=t;e(null,{status:s,statusCode:i,headers:r,body:o},o)},t=>{const{message:s,response:i}=t;e(s,i,i&&i.body)})}}time(t,e=null){const s=e?new Date(e):new Date;let i={"M+":s.getMonth()+1,"d+":s.getDate(),"H+":s.getHours(),"m+":s.getMinutes(),"s+":s.getSeconds(),"q+":Math.floor((s.getMonth()+3)/3),S:s.getMilliseconds()};/(y+)/.test(t)&&(t=t.replace(RegExp.$1,(s.getFullYear()+"").substr(4-RegExp.$1.length)));for(let e in i)new RegExp("("+e+")").test(t)&&(t=t.replace(RegExp.$1,1==RegExp.$1.length?i[e]:("00"+i[e]).substr((""+i[e]).length)));return t}msg(e=t,s="",i="",r){const o=t=>{if(!t)return t;if("string"==typeof t)return this.isLoon()?t:this.isQuanX()?{"open-url":t}:this.isSurge()?{url:t}:void 0;if("object"==typeof t){if(this.isLoon()){let e=t.openUrl||t.url||t["open-url"],s=t.mediaUrl||t["media-url"];return{openUrl:e,mediaUrl:s}}if(this.isQuanX()){let e=t["open-url"]||t.url||t.openUrl,s=t["media-url"]||t.mediaUrl;return{"open-url":e,"media-url":s}}if(this.isSurge()){let e=t.url||t.openUrl||t["open-url"];return{url:e}}}};if(this.isMute||(this.isSurge()||this.isLoon()?$notification.post(e,s,i,o(r)):this.isQuanX()&&$notify(e,s,i,o(r))),!this.isMuteLog){let t=["","==============📣系统通知📣=============="];t.push(e),s&&t.push(s),i&&t.push(i),console.log(t.join("\n")),this.logs=this.logs.concat(t)}}log(...t){t.length>0&&(this.logs=[...this.logs,...t]),console.log(t.join(this.logSeparator))}logErr(t,e){const s=!this.isSurge()&&!this.isQuanX()&&!this.isLoon();s?this.log("",`❗️${this.name}, 错误!`,t.stack):this.log("",`❗️${this.name}, 错误!`,t)}wait(t){return new Promise(e=>setTimeout(e,t))}done(t={}){const e=(new Date).getTime(),s=(e-this.startTime)/1e3;this.log("",`🔔${this.name}, 结束! 🕛 ${s} 秒`),this.log(),(this.isSurge()||this.isQuanX()||this.isLoon())&&$done(t)}}(t,e)}
