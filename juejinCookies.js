
let CookieJJs = []
// 判断环境变量里面是否有掘金Cookies
if (process.env.JJ_COOKIE) {
  if (process.env.JJ_COOKIE.indexOf('&') > -1) {
    CookieJJs = process.env.JJ_COOKIE.split('&');
  } else if (process.env.JJ_COOKIE.indexOf('\n') > -1) {
    CookieJJs = process.env.JJ_COOKIE.split('\n');
  } else {
    CookieJJs = [process.env.JJ_COOKIE];
  }
}
CookieJJs = [...new Set(CookieJJs.filter(item => !!item))]
console.log(`\n====================共${CookieJJs.length}个掘金账号Cookie=========\n`);
console.log(`==================脚本执行- 北京时间(UTC+8)：${new Date(new Date().getTime() + new Date().getTimezoneOffset()*60*1000 + 8*60*60*1000).toLocaleString('zh', {hour12: false}).replace(' 24:',' 00:')}=====================\n`)
for (let i = 0; i < CookieJJs.length; i++) {
  const index = (i + 1 === 1) ? '' : (i + 1);
  exports['CookieJJ' + index] = CookieJJs[i].trim();
}
