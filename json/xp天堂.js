// XP天堂 适配Fongmi修复版，解决图片base64、aesX、cheerio闪退
const sites = [
    'https://ddw7dq9ey089k.cloudfront.net',
    'https://dzsx5k01kgm6y.cloudfront.net',
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

// 替换cheerio，使用Fongmi内置parseHtml原生DOM，消除卡顿
function parseHtml(html) {
    return dom(html);
}

/**
 * 1. 首页分类
 */
async function home(filter) {
    try {
        const res = await req(baseUrl, { headers: { "User-Agent": UA }, timeout: 5000 });
        const html = res ? res.content : '';
        if (!html) return JSON.stringify({ class: [] });
        const $ = parseHtml(html);
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
            const blockTitle = $(element).find('.title-box h2').text().trim();
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
        mylog("home解析异常", e.message);
        return JSON.stringify({ class: [] });
    }
}
async function homeFilter() {
    mylog("开始解析筛选逻辑");
    if (hasParsed) {
        return cachedFilters;
    }
    return {};
}
function fixVodName(name = "") {
    if (!name) return "";
    const parts = name.trim().split(" ");
    return parts.length > 2 ? parts.slice(1, -1).join(" ") : name.trim();
}

/**
 * 图片解密修复：移除aesX依赖，解密失败直接返回原图URL（彻底杜绝超长base64闪退）
 */
async function getRealImgurl(imgurl) {
    // 修复方案：放弃解密base64，直接返回原图地址，避免超大字符串内存溢出
    if (!imgurl) return "";
    try {
        await req(imgurl, {
            method: "get",
            headers: {
                "User-Agent": UA,
                "Referer": "https://wuabeza.gyqspl.cn/"
            },
            timeout: 3000
        });
        // 不生成data:image base64，直接返回图片链接，Fongmi原生加载图片不爆内存
        return imgurl;
    } catch (e) {
        mylog("图片加载失败", imgurl, e.message);
        return "";
    }
}

/**
 * 分类列表，增加单条异常捕获，防止单个影片崩溃整页
 */
async function category(tid, pg, filter, extend) {
    try {
        if (!tid) return JSON.stringify({ list: [] });
        pg = pg || 1;
        extend = extend || {};
        const sort = extend.sort || '';
        let url = `${baseUrl}${tid}/${sort}/${pg}/`.replace(/\/+/g, '/').replace(':/', '://');
        mylog(`分类请求: ${url}`);
        const res = await req(url, { headers: { "User-Agent": UA }, timeout: 6000 });
        const html = res ? res.content : '';
        if (!html) return JSON.stringify({ list: [] });
        const $ = parseHtml(html);
        const videoElements = $('.col-6.col-sm-4.col-lg-3').toArray();
        const list = [];
        // 取消Promise.all并发，串行请求封面，降低并发内存占用
        for (const el of videoElements) {
            try {
                const item = $(el).find('.video-img-box a');
                const href = item.attr('href') || '';
                if (href.includes('/videos/')) {
                    const vod_id = href;
                    let vod_name = $(el).find('.title a').text().trim();
                    vod_name = fixVodName(vod_name);
                    const watchCount = $(el).find('span[class^="interaction_watch_count_"]').text().trim() || '';
                    const vod_remarks = watchCount ? (watchCount + "播放") : "";
                    const vod_year = $(el).find('.label').text().trim();
                    let vod_pic = $(el).find('img.zximg').attr('z-image-loader-url') || '';
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
            } catch (err) { mylog("单条影片解析跳过", err.message); continue; }
        }
        let total = $('ul.dx-pager').attr("data-rec-total") || 0;
        let perPageCount = $('ul.dx-pager').attr("data-rec-per-page") || 1;
        const pagecount = Math.ceil(total / perPageCount) || 1;
        mylog(`分类加载成功:${list.length}条`);
        return JSON.stringify({ list, pagecount });
    } catch (e) {
        mylog("category全局异常", e);
        return JSON.stringify({ list: [] });
    }
}

/**
 * 详情页
 */
async function detail(vid) {
    try {
        const url = (baseUrl + vid).replace(/\/+/g, '/').replace(':/', '://');
        const res = await req(url, { headers: { "User-Agent": UA }, timeout: 6000 });
        const html = res ? res.content : '';
        if (!html) return JSON.stringify({ list: [] });
        const $ = parseHtml(html);
        let vod_name = $('h1.my-foldable-content').text().trim() || $('h1').text().trim();
        let vod_pic = $('#player').attr('data-src') || '';
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
        const regex = /https?:\/\/[^\s"'`]+\.m3u8(?:\?[^\s"'`]+)?/g;
        const match = html.match(regex);
        let hlsUrl = match ? match[0] : '';
        const vod_play_from = "hls线路";
        const vod_play_url = `正片$$${hlsUrl}`;
        const watchCount = $('.video-info span[class^="interaction_watch_count_"]').text().trim() || '';
        const favorite_count = $('#bind_collect_count').text().trim() || '';
        let vod_remarks = watchCount ? (watchCount + "播放") : "";
        if (favorite_count) vod_remarks += (vod_remarks ? " | " : "") + favorite_count + "收藏";
        const back = {
            vod_id: vid,
            vod_remarks,
            vod_name: vod_name,
            vod_pic: vod_pic,
            vod_content: vod_content,
            vod_actor: vod_actor,
            vod_class: vod_class,
            vod_play_from,
            vod_play_url
        };
        return JSON.stringify({ list: [back] });
    } catch (e) {
        mylog("详情页异常", e);
        return JSON.stringify({ list: [] });
    }
}

/**
 * 搜索
 */
async function search(key, quick, page) {
    try {
        page = page || 1;
        const url = `${baseUrl}/search/${encodeURIComponent(key)}/${page}/`.replace(/\/+/g, '/').replace(':/', '://');
        mylog(`搜索: ${url}`);
        const res = await req(url, { headers: { "User-Agent": UA }, timeout: 6000 });
        const html = res ? res.content : '';
        if (!html) return JSON.stringify({ list: [] });
        const $ = parseHtml(html);
        const searchElements = $('.video-img-box').toArray();
        const list = [];
        for (const el of searchElements) {
            try {
                const a = $(el).find('.img-box > a');
                const vod_id = $(a).attr('href') || '';
                const vod_name = fixVodName($(a).find('img').attr('alt') || '');
                let vod_pic = $(a).find('img.zximg').attr('z-image-loader-url') || '';
                if (vod_pic) vod_pic = await getRealImgurl(vod_pic);
                const vod_remarks = $(el).find('.absolute-bottom-right .label').text().trim();
                list.push({ vod_id, vod_name, vod_pic, vod_remarks });
            } catch (err) { mylog("搜索单条跳过", err); continue; }
        }
        let total = $('ul.dx-pager').attr("data-rec-total") || 0;
        let perPageCount = $('ul.dx-pager').attr("data-rec-per-page") || 1;
        const pagecount = Math.ceil(total / perPageCount) || 1;
        return JSON.stringify({ list, pagecount });
    } catch (e) {
        mylog("搜索异常", e);
        return JSON.stringify({ list: [] });
    }
}

async function play(flag, id, vipFlags) {
    return JSON.stringify({
        parse: 0,
        url: id,
        header: { "User-Agent": UA, "Referer": baseUrl }
    });
}

export default { init, home, category, detail, search, play };
