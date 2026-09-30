import json
import re
import sys
import hashlib
import base64
from base64 import b64decode, b64encode
from html import unescape
from urllib.parse import urlparse, urljoin, quote
import requests
from Crypto.Cipher import AES
from Crypto.Util.Padding import unpad
from pyquery import PyQuery as pq
sys.path.append('..')
from base.spider import Spider as BaseSpider


class Spider(BaseSpider):
    def __init__(self):
        try:
            super().__init__()
        except Exception:
            pass
        self.session = requests.Session()
        self.proxies = {}
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'zh-CN,zh;q=0.9',
            'Connection': 'keep-alive',
            'Cache-Control': 'no-cache',
        }
        self.host = ""
        self._line_checked = False
        self._selecting_line = False
        self.dynamic_urls = [
            'https://carry.wlmrpodg.cc/',
            'https://analyze.wlmrpodg.cc/'
        ]

    def init(self, extend=""):
        try:
            self.proxies = json.loads(extend)
        except Exception:
            self.proxies = {}
        self.session.proxies.update(self.proxies)
        self._select_line()
        self.headers.update({'Origin': self.host, 'Referer': f"{self.host}/"})
        print(f"使用站点: {self.host}")

    def getName(self):
        return "🌈 51爆料|终极完美版"

    def isVideoFormat(self, url):
        return any(ext in (url or '').lower() for ext in ['.m3u8', '.mp4', '.ts', '.m3u', '.mpd'])

    def manualVideoCheck(self):
        return False

    def destroy(self):
        try:
            self.session.close()
        except Exception:
            pass

    def _line_alive(self, host):
        try:
            resp = self.session.get(host, headers=self.headers, timeout=6, allow_redirects=True)
            return resp.status_code == 200
        except Exception:
            return False

    def _select_line(self, force=False):
        if self._selecting_line or (self._line_checked and not force):
            return self.host
        self._selecting_line = True
        try:
            for candidate in self.dynamic_urls:
                if self._line_alive(candidate):
                    self.host = candidate.rstrip("/")
                    self._line_checked = True
                    return self.host
            self.host = self.dynamic_urls[0].rstrip("/")
            self._line_checked = True
            return self.host
        finally:
            self._selecting_line = False

    def _get(self, url):
        original_host = self.host
        try:
            if not self._line_checked and not self._selecting_line:
                self._select_line()
                if str(url).startswith(original_host):
                    url = self.host + str(url)[len(original_host):]
            resp = self.session.get(url, headers=self.headers, timeout=15, allow_redirects=True)
            if resp.status_code != 200:
                raise RuntimeError(f"HTTP {resp.status_code}")
            raw = resp.content
            charset = "utf-8"
            ct = resp.headers.get("Content-Type", "")
            if "charset=" in ct:
                charset = ct.split("charset=")[-1].split(";")[0].strip().lower()
            return raw.decode(charset, errors="replace")
        except Exception:
            try:
                if not self._selecting_line and str(url).startswith(original_host):
                    path = str(url)[len(original_host):]
                    self._line_checked = False
                    self._select_line(force=True)
                    if self.host != original_host:
                        new_url = self.host + path
                        resp = self.session.get(new_url, headers=self.headers, timeout=15, allow_redirects=True)
                        if resp.status_code == 200:
                            return resp.content.decode("utf-8", errors="replace")
            except Exception:
                pass
            return None

    def _strip_html(self, text):
        text = unescape(str(text or ""))
        text = re.sub(r"<[^>]+>", " ", text)
        return re.sub(r"\s+", " ", text).strip()

    def _extract_video_urls(self, html):
        urls = []
        if not html:
            return urls
        seen = set()
        configs = re.findall(r'data-config\s*=\s*(["\'])(.*?)\1', html, re.I | re.S)
        for _, raw in configs:
            try:
                config = json.loads(unescape(raw))
                video = config.get("video") or {}
                url = video.get("url")
                if not url:
                    h265 = config.get("video_h265")
                    if isinstance(h265, dict):
                        url = h265.get("url")
                url = str(url or "").replace("\\/", "/")
                if url.startswith("http") and url not in seen:
                    seen.add(url)
                    urls.append(url)
            except Exception:
                continue
        if not urls:
            for _, value in re.findall(r"var\s+dp_video_url(_\d+)?\s*=\s*['\"]([^'\"]+)['\"]", html):
                try:
                    url = base64.b64decode(value).decode("utf-8")
                except Exception:
                    continue
                if url.startswith("//"):
                    url = "https:" + url
                if url.startswith("http") and url not in seen:
                    seen.add(url)
                    urls.append(url)
        return urls

    def _parse_pagecount(self, html):
        if not html:
            return 1
        m = re.search(r'class=["\'][^"\']*page-current[^"\']*["\'][^>]*>\s*(\d+)\s*/\s*(\d+)', html, re.I)
        if m:
            try:
                return int(m.group(2))
            except Exception:
                pass
        pages = re.findall(r'href="[^"]*page/(\d+)[^"]*"', html)
        if pages:
            return max(int(p) for p in pages)
        return 1

    def homeContent(self, filter):
        html = self._get(self.host)
        if not html:
            return {'class': [], 'list': []}
        data = self.getpq(html)
        classes = []
        category_selectors = ['.category-list ul li', '.nav-menu li', '.menu li', 'nav ul li']
        for selector in category_selectors:
            for k in data(selector).items():
                link = k('a')
                href = (link.attr('href') or '').strip()
                name = (link.text() or '').strip()
                if not href or href == '#' or not name:
                    continue
                classes.append({'type_name': name, 'type_id': href})
            if classes:
                break
        if not classes:
            classes = [{'type_name': '最新', 'type_id': '/latest/'}, {'type_name': '热门', 'type_id': '/hot/'}]
        return {'class': classes, 'list': self.getlist(data('#index article, article'))}

    def homeVideoContent(self):
        html = self._get(self.host)
        if not html:
            return {'list': []}
        data = self.getpq(html)
        return {'list': self.getlist(data('#index article, article'))}

    def categoryContent(self, tid, pg, filter, extend):
        try:
            if '@folder' in tid:
                v = self.getfod(tid.replace('@folder', ''))
                return {'list': v, 'page': 1, 'pagecount': 1, 'limit': 90, 'total': len(v)}
            pg = int(pg) if pg else 1
            if tid.startswith('http'):
                base_url = tid.rstrip('/')
            else:
                path = tid if tid.startswith('/') else f"/{tid}"
                base_url = f"{self.host}{path}".rstrip('/')
            if pg == 1:
                url = f"{base_url}/"
            else:
                url = f"{base_url}/{pg}/"
            html = self._get(url)
            if not html:
                return {'list': [], 'page': pg, 'pagecount': 1, 'limit': 90, 'total': 0}
            data = self.getpq(html)
            videos = self.getlist(data('#archive article, #index article, article'), tid)
            pc = self._parse_pagecount(html)
            return {'list': videos, 'page': pg, 'pagecount': pc, 'limit': 90, 'total': pc * 20}
        except Exception:
            return {'list': [], 'page': pg, 'pagecount': 1, 'limit': 90, 'total': 0}

    def detailContent(self, ids):
        try:
            vod_id = ids[0]
            url = vod_id if vod_id.startswith('http') else f"{self.host}{vod_id}"
            html = self._get(url)
            if not html:
                return {'list': [{'vod_play_from': '51爆料', 'vod_play_url': '获取失败'}]}
            data = self.getpq(html)
            plist = []
            used_names = set()
            video_urls = self._extract_video_urls(html)
            for idx, video_url in enumerate(video_urls, start=1):
                ep_name = f"视频{idx}"
                parent = data('.dplayer').eq(idx-1).parents().eq(0) if data('.dplayer') else None
                if parent:
                    for _ in range(4):
                        heading = parent.find('h2,h3,h4').eq(0).text().strip()
                        if heading:
                            ep_name = heading
                            break
                        parent = parent.parents().eq(0)
                base_name = ep_name
                name = base_name
                count = 2
                while name in used_names:
                    name = f"{base_name} {count}"
                    count += 1
                used_names.add(name)
                plist.append(f"{name}${video_url}")
            if not plist:
                content_area = data('.post-content, article')
                for i, link in enumerate(content_area('a').items(), start=1):
                    link_text = link.text().strip()
                    link_href = link.attr('href')
                    if link_href and any(kw in link_text for kw in ['点击观看', '观看', '播放', '视频', '第一弹', '第二弹']):
                        ep_name = link_text.replace('点击观看：', '').replace('点击观看', '').strip()
                        if not ep_name:
                            ep_name = f"视频{i}"
                        if not link_href.startswith('http'):
                            link_href = urljoin(self.host + "/", link_href)
                        plist.append(f"{ep_name}${link_href}")
            play_url = '#'.join(plist) if plist else f"未找到视频源${url}"
            vod_content = ''
            try:
                tags = []
                seen_names = set()
                seen_ids = set()
                tag_links = data('.tags a, .keywords a, .post-tags a')
                candidates = []
                for k in tag_links.items():
                    title = k.text().strip()
                    href = k.attr('href')
                    if title and href:
                        candidates.append({'name': title, 'id': href})
                candidates.sort(key=lambda x: len(x['name']), reverse=True)
                for item in candidates:
                    name = item['name']
                    id_ = item['id']
                    if id_ in seen_ids:
                        continue
                    dup = False
                    for sn in seen_names:
                        if name in sn:
                            dup = True
                            break
                    if not dup:
                        target = json.dumps({'id': id_, 'name': name})
                        tags.append(f'[a=cr:{target}/]{name}[/a]')
                        seen_names.add(name)
                        seen_ids.add(id_)
                if tags:
                    vod_content = ' '.join(tags)
                else:
                    vod_content = self._strip_html(data('.post-title').text())
            except Exception:
                vod_content = '获取标签失败'
            if not vod_content:
                vod_content = self._strip_html(data('h1').text()) or '51爆料'
            return {'list': [{'vod_play_from': '51爆料', 'vod_play_url': play_url, 'vod_content': vod_content}]}
        except Exception:
            return {'list': [{'vod_play_from': '51爆料', 'vod_play_url': '获取失败'}]}

    def searchContent(self, key, quick, pg="1"):
        pg = int(pg) if pg else 1
        try:
            if pg == 1:
                url = f"{self.host}/search/{quote(key, safe='')}/"
            else:
                url = f"{self.host}/search/{quote(key, safe='')}/{pg}/"
            html = self._get(url)
            if not html:
                return {'list': [], 'page': pg, 'pagecount': 1}
            data = self.getpq(html)
            pc = self._parse_pagecount(html)
            return {'list': self.getlist(data('article')), 'page': pg, 'pagecount': pc}
        except Exception:
            return {'list': [], 'page': pg, 'pagecount': 1}

    def playerContent(self, flag, id, vipFlags):
        try:
            if self.isVideoFormat(id):
                return {
                    'parse': 0,
                    'url': id,
                    'header': dict(self.headers)
                }
            if id.startswith("/") or id.startswith("http"):
                if not id.startswith("http"):
                    detail_url = self.host + id
                else:
                    detail_url = id
                html = self._get(detail_url)
                if html:
                    urls = self._extract_video_urls(html)
                    if urls:
                        return {
                            "parse": 0,
                            "url": urls[0],
                            "header": dict(self.headers)
                        }
            return {'parse': 1, 'url': id, 'header': {}}
        except Exception:
            return {'parse': 1, 'url': id, 'header': {}}

    def _decrypt_image(self, data):
        if not data or data.startswith((b"\xff\xd8", b"\x89PNG", b"GIF8", b"RIFF")):
            return data
        keys = (
            (b'f5d965df75336270', b'97b60394abc2fbe1'),
            (b'75336270f5d965df', b'abc2fbe197b60394'),
        )
        for k, v in keys:
            try:
                dec = unpad(AES.new(k, AES.MODE_CBC, v).decrypt(data), 16)
                if dec.startswith((b'\xff\xd8', b'\x89PNG', b'GIF8', b"RIFF")):
                    return dec
            except Exception:
                pass
            try:
                dec = unpad(AES.new(k, AES.MODE_ECB).decrypt(data), 16)
                if dec.startswith(b'\xff\xd8'):
                    return dec
            except Exception:
                pass
        return data

    def _image_mime(self, data, url=""):
        if data.startswith(b"\xff\xd8"):
            return "image/jpeg"
        if data.startswith(b"\x89PNG"):
            return "image/png"
        if data.startswith(b"GIF8"):
            return "image/gif"
        if data.startswith(b"RIFF"):
            return "image/webp"
        clean_url = str(url).lower().split("?",1)[0]
        return "image/png" if clean_url.endswith(".png") else "image/jpeg"

    def localProxy(self, param):
        try:
            type_ = param.get('type')
            url_enc = param.get('url', '')
            if type_ == 'img':
                try:
                    real_url = base64.urlsafe_b64decode(url_enc.encode("ascii")).decode("utf-8")
                except Exception:
                    real_url = url_enc
                resp = self.session.get(real_url, headers=self.headers, timeout=10, allow_redirects=True)
                if resp.status_code != 200:
                    return [resp.status_code, "text/plain", b""]
                content = self._decrypt_image(resp.content)
                ctype = self._image_mime(content, real_url)
                return [200, ctype, content]
            elif type_ == 'm3u8':
                real_url = base64.urlsafe_b64decode(url_enc.encode("ascii")).decode("utf-8")
                res = self.session.get(real_url, headers=self.headers)
                data = res.text
                base = res.url.rsplit('/', 1)[0]
                lines = []
                for line in data.split('\n'):
                    if '#EXT' not in line and line.strip():
                        if not line.startswith('http'):
                            line = f"{base}/{line}"
                        enc = base64.urlsafe_b64encode(line.encode()).decode()
                        lines.append(f"{self.getProxyUrl()}&url={enc}&type=ts")
                    else:
                        lines.append(line)
                return [200, "application/vnd.apple.mpegurl", '\n'.join(lines)]
            elif type_ == 'ts':
                real_url = base64.urlsafe_b64decode(url_enc.encode("ascii")).decode("utf-8")
                cont = self.session.get(real_url, headers=self.headers).content
                return [200, 'video/mp2t', cont]
            else:
                return [404, 'text/plain', b'']
        except Exception:
            return [404, 'text/plain', b'']

    def proxy(self, data, type='m3u8'):
        if not data:
            return data
        enc = base64.urlsafe_b64encode(str(data).encode()).decode()
        return f"{self.getProxyUrl()}&url={enc}&type={type}"

    def getlist(self, data, tid=''):
        videos = []
        is_folder = '/mrdg' in (tid or '')
        for k in data.items():
            card_html = k.outer_html() if hasattr(k, 'outer_html') else str(k)
            a = k if k.is_('a') else k('a').eq(0)
            href = a.attr('href')
            title = k('h2').text() or k('.entry-title').text() or k('.post-title').text()
            if not title and k.is_('a'):
                title = k.text()
            if href and title:
                img = self.getimg(k('script').text(), k, card_html)
                videos.append({
                    'vod_id': f"{href}{'@folder' if is_folder else ''}",
                    'vod_name': self._strip_html(title),
                    'vod_pic': img,
                    'vod_remarks': self._strip_html(k('time').text() or ''),
                    'vod_tag': 'folder' if is_folder else '',
                    'style': {"type": "rect", "ratio": 1.33}
                })
        return videos

    def getfod(self, id):
        url = f"{self.host}{id}"
        html = self._get(url)
        if not html:
            return []
        data = self.getpq(html)
        videos = []
        for i, h2 in enumerate(data('.post-content h2').items()):
            p_txt = data('.post-content p').eq(i * 2)
            p_img = data('.post-content p').eq(i * 2 + 1)
            p_html = p_img.outer_html() if hasattr(p_img, 'outer_html') else str(p_img)
            videos.append({
                'vod_id': p_txt('a').attr('href'),
                'vod_name': self._strip_html(p_txt.text()),
                'vod_pic': self.getimg('', p_img, p_html),
                'vod_remarks': self._strip_html(h2.text())
            })
        return videos

    def getimg(self, text, elem=None, html_content=None):
        if m := re.search(r"loadBannerDirect\('([^']+)'", text or ''):
            return self._proc_url(m.group(1))
        if html_content is None and elem is not None:
            html_content = elem.outer_html() if hasattr(elem, 'outer_html') else str(elem)
        if not html_content:
            return ''
        html_content = html_content.replace('&quot;', '"').replace('&apos;', "'").replace('&amp;', '&')
        if 'data:image' in html_content:
            m = re.search(r'(data:image/[a-zA-Z0-9+/=;,]+)', html_content)
            if m:
                b64part = m.group(1)
                _, b64_str = b64part.split(",", 1)
                raw = base64.b64decode(b64_str)
                raw = self._decrypt_image(raw)
                mime = self._image_mime(raw)
                import binascii
                b64new = binascii.b2a_base64(raw).rstrip(b'\n').decode()
                return f"data:{mime};base64,{b64new}"
        m = re.search(r'(https?://[^"\'\s)]+\.(?:jpg|png|jpeg|webp))', html_content, re.I)
        if m:
            return self._proc_url(m.group(1))
        if 'url(' in html_content:
            m = re.search(r'url\s*\(\s*[\'"]?([^"\'\)]+)[\'"]?\s*\)', html_content, re.I)
            if m:
                return self._proc_url(m.group(1))
        return ''

    def _proc_url(self, url):
        if not url:
            return ''
        url = url.strip('\'" ')
        if url.startswith('data:'):
            return url
        if not url.startswith('http'):
            url = urljoin(self.host + "/", url)
        return self.proxy(url, type="img")

    def getpq(self, data):
        try:
            return pq(data)
        except Exception:
            return pq(data.encode('utf-8'))