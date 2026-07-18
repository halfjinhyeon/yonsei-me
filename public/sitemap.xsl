<?xml version="1.0" encoding="UTF-8"?>
<!-- /sitemap.xml 을 사람이 브라우저로 열었을 때 사이트 디자인(네이비 박스 헤더 +
     에디토리얼 표)으로 보여주는 스타일시트. 크롤러는 이 파일을 무시한다. -->
<xsl:stylesheet version="1.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:sm="http://www.sitemaps.org/schemas/sitemap/0.9">
  <xsl:output method="html" encoding="UTF-8" indent="yes" />

  <xsl:template match="/">
    <html lang="ko">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>사이트맵 · 연세대학교 기계공학부</title>
        <style>
          :root { color-scheme: light; }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: Pretendard, 'Pretendard Variable', -apple-system, 'Segoe UI',
              'Malgun Gothic', system-ui, sans-serif;
            background: #ffffff;
            color: #111827;
            line-height: 1.6;
          }
          .wrap { max-width: 1360px; margin: 0 auto; padding: 56px 24px 96px; }
          .head { display: flex; align-items: center; gap: 24px; }
          .label {
            display: inline-block; background: #00285e; color: #fff;
            padding: 10px 20px; font-size: 18px; font-weight: 700; flex-shrink: 0;
          }
          .head .line { height: 1px; flex: 1; background: #e0e6ed; }
          .meta { margin-top: 20px; color: #475569; font-size: 14px; }
          .meta strong { color: #111827; }
          table { width: 100%; border-collapse: collapse; margin-top: 28px; font-size: 15px; }
          thead th {
            text-align: left; font-size: 12px; font-weight: 700; color: #64748b;
            padding: 12px 8px; border-top: 2px solid #00285e; border-bottom: 1px solid #e0e6ed;
            white-space: nowrap;
          }
          tbody td { padding: 12px 8px; border-bottom: 1px solid #e0e6ed; }
          a { color: #0057a8; text-decoration: none; word-break: break-all; }
          a:hover { text-decoration: underline; }
          .mod { color: #64748b; font-size: 13px; white-space: nowrap; }
          .num { color: #94a3b8; font-size: 13px; text-align: right; width: 3.5em; }
        </style>
      </head>
      <body>
        <div class="wrap">
          <div class="head">
            <span class="label">사이트맵</span>
            <span class="line"></span>
          </div>
          <p class="meta">
            연세대학교 기계공학부 — 검색엔진에 제공되는 전체 페이지 목록입니다. 총
            <strong><xsl:value-of select="count(sm:urlset/sm:url)" /></strong>개 URL.
          </p>
          <table>
            <thead>
              <tr>
                <th class="num">#</th>
                <th>주소</th>
                <th>마지막 수정</th>
              </tr>
            </thead>
            <tbody>
              <xsl:for-each select="sm:urlset/sm:url">
                <tr>
                  <td class="num"><xsl:value-of select="position()" /></td>
                  <td>
                    <a>
                      <xsl:attribute name="href"><xsl:value-of select="sm:loc" /></xsl:attribute>
                      <xsl:value-of select="sm:loc" />
                    </a>
                  </td>
                  <td class="mod"><xsl:value-of select="substring(sm:lastmod, 1, 10)" /></td>
                </tr>
              </xsl:for-each>
            </tbody>
          </table>
        </div>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
