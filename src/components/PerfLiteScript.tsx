/**
 * GPU 가속이 꺼진 브라우저를 부팅 시점에 판정해 <html> 에 `perf-lite` 를 붙인다.
 *
 * 왜 필요한가: Chrome 설정에서 "가능한 경우 하드웨어 가속 사용"을 끄면 합성이
 * 소프트웨어 래스터(SwiftShader/WARP)로 떨어진다. 이때 메가메뉴의
 * `backdrop-filter: blur(20px)` 은 전폭 시트 뒤 배경을 CPU 가우시안 블러로 매 프레임
 * 다시 계산해 열고 닫는 200ms 전이가 눈에 띄게 끊긴다.
 * 실측(--disable-gpu 헤드리스, CPU 4x 스로틀, 1.4초 창, 5회 반복):
 *   현행        32ms 초과 프레임 7개 (5회 모두 7, 최대 프레임 33~50ms)
 *   블러 해제   32ms 초과 프레임 0개 (5회 모두 0, 최대 프레임 17ms)
 * CSS 미디어 쿼리로는 GPU 유무를 알 수 없어 런타임 판정이 유일한 방법이다.
 *
 * 판정 방법: WebGL 렌더러 문자열. 하드웨어 가속이 꺼지면 여기에 SwiftShader /
 * llvmpipe / Microsoft Basic Render Driver 같은 소프트웨어 래스터라이저 이름이 뜬다.
 *
 * ⚠️ 캐시는 **sessionStorage** 여야 한다. localStorage(7일)로 했더니 가속을 켠 채
 * 방문한 적 있는 사용자는 이후 설정을 꺼도 낡은 "GPU 있음" 판정이 남아 판정이
 * 안 걸렸다(시크릿탭에서만 걸리는 증상으로 드러남). 가속 설정 변경은 브라우저
 * 재시작이 필요하므로, 탭 세션 수명이 이 판정의 유효기간과 정확히 일치한다.
 * 캐시를 두는 이유는 소프트웨어 래스터에서 WebGL 컨텍스트 생성이 수십 ms 들 수 있어서다.
 *
 * body 최상단에서 동기 실행 — 헤더 마크업이 파싱되기 전에 클래스가 붙어야
 * 블러가 한 프레임도 그려지지 않는다.
 */
const SCRIPT = `(function(){try{
var d=document.documentElement,K='perf-lite:v2',c=null;
try{localStorage.removeItem('perf-lite:v1')}catch(e){}
try{c=sessionStorage.getItem(K)}catch(e){}
if(c==='1'){d.classList.add('perf-lite');return}
if(c==='0'){return}
var soft=false;
try{
var g=document.createElement('canvas').getContext('webgl')||document.createElement('canvas').getContext('experimental-webgl');
if(!g){soft=true}else{
var x=g.getExtension('WEBGL_debug_renderer_info');
var r=x?String(g.getParameter(x.UNMASKED_RENDERER_WEBGL)):'';
soft=!r||/swiftshader|llvmpipe|softpipe|basic render|generic renderer|software|microsoft basic/i.test(r);
var lc=g.getExtension('WEBGL_lose_context');if(lc){lc.loseContext()}}
}catch(e){soft=true}
if(soft){d.classList.add('perf-lite')}
try{sessionStorage.setItem(K,soft?'1':'0')}catch(e){}
}catch(e){}})();`;

export function PerfLiteScript() {
  // 자체 생성 정적 문자열(사용자 입력 미포함) — XSS 벡터 없음
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
