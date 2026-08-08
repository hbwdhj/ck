import cheerio from 'assets://js/lib/cheerio.min.js';

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

/**
 * 1. 动态获取并解析全量的一级分类 (class)
 */
async function home(filter) {
    try {
        const res = await req(baseUrl, { headers: { "User-Agent": UA } });
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
            const blockTitle = $(element).find('.title-box h2').text().trim();

            // === 解析【选片主题】块 ===
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

            // === 解析【平级标签】块 ===
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
        console.error("❌ 全自动解析 class 失败: ", e.message);
        return JSON.stringify({ class: [] });
    }
}

/**
 * 2. 筛选逻辑
 */
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
 * 3. 分类列表页解析
 */
async function category(tid, pg, filter, extend) {
    try {
        if (!tid) return JSON.stringify({ list: [] });
        pg = pg || 1;
        extend = extend || {};
        const sort = extend.sort || '';

        let url = `${baseUrl}${tid}/${sort}/${pg}/`.replace(/\/+/g, '/').replace(':/', '://');
        mylog(`🚀 正在请求分类URL: ${url}`);

        const res = await req(url, { headers: { "User-Agent": UA } });
        const html = res ? res.content : '';
        if (!html) return JSON.stringify({ list: [] });

        const $ = cheerio.load(html);
        const videoElements = $('.col-6.col-sm-4.col-lg-3').toArray();

        const tasks = videoElements.map(async (el) => {
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
                if (vod_pic) {
                    vod_pic = await getRealImgurl(vod_pic);
                }

                return {
                    vod_id,
                    vod_name,
                    vod_pic,
                    vod_year,
                    vod_remarks,
                    land: 1,
                    ratio: 1.78
                };
            }
            return null;
        });

        const results = await Promise.all(tasks);
        let list = results.filter(item => item !== null);

        let total = $('ul.dx-pager').attr("data-rec-total") || 0;
        let perPageCount = $('ul.dx-pager').attr("data-rec-per-page") || 1;
        const pagecount = Math.ceil(total / perPageCount) || 1;

        mylog(`category 成功抓取有效视频数: ${list.length}`);
        return JSON.stringify({ list, pagecount });

    } catch (e) {
        mylog(e);
        return JSON.stringify({ list: [] });
    }
}

/**
 * 4. 详情页解析
 */
async function detail(vid) {
    try {
        const url = (baseUrl + vid).replace(/\/+/g, '/').replace(':/', '://');
        const res = await req(url, { headers: { "User-Agent": UA } });
        const html = res ? res.content : '';
        if (!html) return JSON.stringify({ list: [] });

        const $ = cheerio.load(html);

        let vod_name = $('h1.my-foldable-content').text().trim() || $('h1').text().trim();
        let vod_pic = $('#player').attr('data-src') || '';
        if (vod_pic) {
            vod_pic = await getRealImgurl(vod_pic);
        }

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

        // 正则解析 m3u8 地址
        const regex = /https?:\/\/[^\s"'`]+\.m3u8(?:\?[^\s"'`]+)?/g;
        const match = html.match(regex);
        let hlsUrl = match ? match[0] : '';

        const lines = ["hls线路"];
        const vod_play_from = lines.join("$$$");
        // 已修正：去掉模板字符串中原先不合规的转义字符 \$
        const playlistArray = [`正片$${hlsUrl}`];
        const vod_play_url = playlistArray.join('$$$');

        const watchCount = $('.video-info span[class^="interaction_watch_count_"]').text().trim().toUpperCase() || '';
        const favorite_count = $('#bind_collect_count').text().trim().toUpperCase() || '';
        let vod_remarks = watchCount ? (watchCount + "播放") : "";
        if (favorite_count) {
            vod_remarks += (vod_remarks ? " | " : "") + favorite_count + "收藏";
        }

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
        mylog(e);
        return JSON.stringify({ list: [] });
    }
}

/**
 * 5. 搜索功能
 */
async function search(key, quick, page) {
    try {
        page = page || 1;
        const url = `${baseUrl}/search/${encodeURIComponent(key)}/${page}/`.replace(/\/+/g, '/').replace(':/', '://');
        mylog(`正在搜索: ${url}`);

        const res = await req(url, { headers: { "User-Agent": UA } });
        const html = res ? res.content : '';
        if (!html) return JSON.stringify({ list: [] });

        const $ = cheerio.load(html);
        const searchElements = $('.video-img-box').toArray();

        const tasks = searchElements.map(async (el) => {
            const a = $(el).find('.img-box > a');
            const vod_id = $(a).attr('href') || '';
            const vod_name = $(a).find('img').attr('alt') || '';
            let vod_pic = $(a).find('img.zximg').attr('z-image-loader-url') || '';

            if (vod_pic) {
                vod_pic = await getRealImgurl(vod_pic);
            }

            const vod_remarks = $(el).find('.absolute-bottom-right .label').text().trim();

            return {
                vod_id: vod_id,
                vod_name: fixVodName(vod_name),
                vod_pic: vod_pic,
                vod_remarks: vod_remarks
            };
        });

        const list = await Promise.all(tasks);

        let total = $('ul.dx-pager').attr("data-rec-total") || 0;
        let perPageCount = $('ul.dx-pager').attr("data-rec-per-page") || 1;
        const pagecount = Math.ceil(total / perPageCount) || 1;

        return JSON.stringify({ list, pagecount });
    } catch (e) {
        mylog(e);
        return JSON.stringify({ list: [] });
    }
}

/**
 * 6. 播放解析接口
 */
async function play(flag, id, vipFlags) {
    return JSON.stringify({
        parse: 0,
        url: id,
        header: { "User-Agent": UA, "Referer": baseUrl }
    });
}

/**
 * 7. 解密图片 Base64 工具函数
 */
async function getRealImgurl(imgurl) {
    try {
        if (!imgurl) return "";
        let res = await req(imgurl, {
            method: "get",
            headers: {
                "User-Agent": UA,
                "Referer": "https://wuabeza.gyqspl.cn/"
            },
            buffer: 2
        });

        const encryptedBase64 = res ? res.content : '';
        if (!encryptedBase64) return "";

        let realImageBase64 = aesX(
            "AES/CBC/No",
            false,
            encryptedBase64,
            true,
            "f5d965df75336270",
            "97b60394abc2fbe1",
            true
        );

        if (!realImageBase64) return "";

        let ext = "jpeg";
        if (imgurl.toLowerCase().indexOf(".gif") !== -1) {
            ext = "gif";
        } else if (imgurl.toLowerCase().indexOf(".png") !== -1) {
            ext = "png";
        }

        return "data:image/" + ext + ";base64," + realImageBase64;
    } catch (e) {
        return "";
    }
}

export default { init, home, category, detail, search, play };