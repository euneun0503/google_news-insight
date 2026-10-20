/* 입장 비밀번호 설정
 * 비밀번호를 바꾸려면: 아래 PASSWORD_SHA256 값을 새 비밀번호의 해시로 바꾸세요.
 * 해시 만드는 법 (터미널):  echo -n "google_news-insight:새비밀번호" | shasum -a 256
 * 주의: 사이트 입장만 막는 장치예요. 저장소가 공개(Public)면 data/ 폴더는 누구나 열 수 있어요.
 */
window.GI_CONFIG = {
  SALT: "google_news-insight:",
  PASSWORD_SHA256: "8f91a473bc1569c7ef547f55ed924d1157662a24ff266ad26a7b3aabc279e114",
  REMEMBER_DAYS: 30,
};
