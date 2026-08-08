// XP天堂 Fongmi修复版｜修复图片空白、播放带$无法播放、闪退
import cheerio from 'assets://js/lib/cheerio.min.js';
const sites = [
    'https://ddw7dq9ey089k.cloudfront.net',
    'shturl.cc/acZZucqmhG6ddUbzMYdaMVJjJy',
    'https://afford.aaubygttf.com',
    'https://beyond.aaubygttf.com',
    'https://anger.aaubygttf.com',
    'https://arm.aaubygttf.com'
];
const baseUrl = sites[0];
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
function mylog() {
    const TAG = "xp18+";
    console.log(TAG, ...arguments);
}
async function init(extend) { }
let cachedClasses = [];
let cachedFilters = {};
let hasParsed = false;

async function home(filter) {
    try {
        const res = await req(baseUrl, { headers: { "User‑Agent": UA }, timeout: 5000 });
        const html = res ? res.content : '';
        if (!html) return JSON.stringify({ class: [] });
        const $ = cheerio.load(html);
        let classes = [];
        let filters = {};
        const sortFilter = [
            {
                key: "sort",
                name: "排序",
                value: [
                    { n: "最近更新", v: "update" },
                    { n: "最高收藏", v: "favorite" },
                    { n: "近期最佳", v: "hot" },
                    { n: "最多观看", v: "watch" }
                ]
            }
        ];
        $('.app-nav .container').each((index, element) => {
            const blockTitle = $(element).find('.title‑box h2').text().trim();
            if (blockTitle.includes("选片") || blockTitle.includes("主题")) {
                $(element).find('a.tjtagmanager').each((i, el) => {
                    const name = $(el).text().trim();
                    let href = $(el).attr('href') || '';
                    href = href.replace(/\/(favorite|update|hot|watch)\/?$/, '');
                    if (href && name) {
                        classes.push({ type_id: href, type_name: name });
                        filters[href] = sortFilter;
                    }
                });
            }
            if ($(element).find('a.tag').length > 0) {
                $(element).find('a.tag').each((i, el) => {
                    const name = $(el).text().trim();
                    let href = $(el).attr('href') || '';
                    href = href.replace(/\/(favorite|update|hot|watch)\/?$/, '');
                    if (href && name) {
                        classes.push({ type_id: href, type_name: `🏷️ ${name}` });
                        filters[href] = sortFilter;
                    }
                });
            }
        });
        cachedClasses = classes.filter(item => !item.type_name.includes("资讯") && !item.type_name.includes('回家'));
        cachedFilters = filters;
        hasParsed = true;
        return JSON.stringify({
            class: cachedClasses,
            filters: await homeFilter()
        });
    } catch (e) {
        mylog("首页解析异常", e.message);
        return JSON.stringify({ class: [] });
    }
}
async function homeFilter() {
    if (hasParsed) return cachedFilters;
    return {};
}
function fixVodName(name = "") {
    if (!name) return "";
    const parts = name.trim().split(" ");
    return parts.length > 2 ? parts.slice(1, -1).join(" ") : name.trim();
}

// 图片处理：不再内部GET请求（会403空白），原样返回加密图片地址
async function getRealImgurl(imgurl) {
    if (!imgurl) return "";
    // 直接返回原始加密图片地址，不在脚本内解密，避免大base64造成闪退
    return imgurl;
}

async function category(tid, pg, filter, extend) {
    try {
        if (!tid) return JSON.stringify({ list: [] });
        pg = pg || 1;
        extend = extend || {};
        const sort = extend.sort || '';
        let url = `${baseUrl}${tid}/${sort}/${pg}/`.replace(/\/+/g, '/').replace(':/', '://');
        const res = await req(url, { headers: { "User‑Agent": UA }, timeout: 6000 });
        const html = res ? res.content : '';
        if (!html) return JSON.stringify({ list: [] });
        const $ = cheerio.load(html);
        const videoElements = $('.col‑6.col‑sm‑4.col‑lg‑3').toArray();
        const list = [];
        for (const el of videoElements) {
            try {
                const item = $(el).find('.video‑img‑box a');
                const href = item.attr('href') || '';
                if (href.includes('/videos/')) {
                    const vod_id = href;
                    let vod_name = $(el).find('.title a').text().trim();
                    vod_name = fixVodName(vod_name);
                    const watchCount = $(el).find('span[class^="interaction_watch_count_"]').text().trim() || '';
                    const vod_remarks = watchCount ? (watchCount + "播放") : "";
                    const vod_year = $(el).find('.label').text().trim();
                    let vod_pic = $(el).find('img.zximg').attr('z‑image‑loader‑url') || '';
                    if (vod_pic) vod_pic = await getRealImgurl(vod_pic);
                    list.push({
                        vod_id,
                        vod_name,
                        vod_pic,
                        vod_year,
                        vod_remarks,
                        land: 1,
                        ratio: 1.78
                    });
                }
            } catch (err) {
                mylog("单条影片跳过", err.message);
                continue;
            }
        }
        let total = $('ul.dx‑pager').attr("data‑rec‑total") || 0;
        let perPageCount = $('ul.dx‑pager').attr("data‑rec‑per‑page") || 1;
        const pagecount = Math.ceil(total / perPageCount) || 1;
        return JSON.stringify({ list, pagecount });
    } catch (e) {
        mylog("分类页面异常", e);
        return JSON.stringify({ list: [] });
    }
}

async function detail(vid) {
    try {
        const url = (baseUrl + vid).replace(/\/+/g, '/').replace(':/', '://');
        const res = await req(url, { headers: { "User‑Agent": UA }, timeout: 6000 });
        const html = res ? res.content : '';
        if (!html) return JSON.stringify({ list: [] });
        const $ = cheerio.load(html);
        let vod_name = $('h1.my‑foldable‑content').text().trim() || $('h1').text().trim();
        let vod_pic = $('#player').attr('data‑src') || '';
        if (vod_pic) vod_pic = await getRealImgurl(vod_pic);
        let tagsArray = [];
        $('h5.tags a').each((i, el) => {
            let tagName = $(el).text().trim();
            if (tagName) tagsArray.push(tagName);
        });
        let vod_actor = tagsArray.join('/');
        let vod_class = tagsArray.join(' ');
        let vod_content = "标签快捷搜索：\n";
        tagsArray.forEach(tag => {
            vod_content += `[a=cr:{"action":"category","key":"${tag}"}/]【${tag}】[/a]   `;
        });
        // 修复：捕获m3u8，去除链接最前面多余$符号
        const regex = /https?:\/\/[^\s"'`]+\.m3u8(?:\?[^\s"'`]+)?/g;
        const match = html.match(regex);
        let hlsUrl = match ? match[0].replace(/^\$+/,'') : '';
        const vod_play_from = "hls线路";
        const vod_play_url = `正片$$${hlsUrl}`;
        const watchCount = $('.video‑info span[class^="interaction_watch_count_"]').text().trim() || '';
        const favorite_count = $('#bind_collect_count').text().trim() || '';
        let vod_remarks = watchCount ? (watchCount + "播放") : "";
        if (favorite_count) vod_remarks += (vod_remarks ? " | " : "") + favorite_count + "收藏";
        const back = {
            vod_id: vid,
            vod_remarks,
            vod_name: vod_name,
            vod_pic: vod_pic,
            vod_content,
            vod_actor,
            vod_class,
            vod_play_from,
            vod_play_url
        };
        return JSON.stringify({ list: [back] });
    } catch (e) {
        mylog("详情页加载失败", e);
        return JSON.stringify({ list: [] });
    }
}

async function search(key, quick, page) {
    try {
        page = page || 1;
        const url = `${baseUrl}/search/${encodeURIComponent(key)}/${page}/`.replace(/\/+/g, '/').replace(':/', '://');
        const res = await req(url, { headers: { "User‑Agent": UA }, timeout: 6000 });
        const html = res ? res.content : '';
        if (!html) return JSON.stringify({ list: [] });
        const $ = cheerio.load(html);
        const searchElements = $('.video‑img‑box').toArray();
        const list = [];
        for (const el of searchElements) {
            try {
                const a = $(el).find('.img‑box > a');
                const vod_id = $(a).attr('href') || '';
                const vod_name = fixVodName($(a).find('img').attr('alt') || '');
                let vod_pic = $(a).find('img.zximg').attr('z‑image‑loader‑url') || '';
                if (vod_pic) vod_pic = await getRealImgurl(vod_pic);
                const vod_remarks = $(el).find('.absolute‑bottom‑right .label').text().trim();
                list.push({ vod_id, vod_name, vod_pic, vod_remarks });
            } catch (err) {
                mylog("搜索单条解析失败", err);
                continue;
            }
        }
        let total = $('ul.dx‑pager').attr("data‑rec‑total") || 0;
        let perPageCount = $('ul.dx‑pager').attr("data‑rec‑per‑page") || 1;
        const pagecount = Math.ceil(total / perPageCount) || 1;
        return JSON.stringify({ list, pagecount });
    } catch (e) {
        mylog("搜索接口异常", e);
        return JSON.stringify({ list: [] });
    }
}

async function play(flag, id, vipFlags) {
    return JSON.stringify({
        parse: 0,
        url: id,
        header: {
            "User‑Agent": UA,
            "Referer": baseUrl
        }
    });
}

export default { init, home, category, detail, search, play };
