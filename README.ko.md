<p align="right">
  <a href="./README.md">EN</a> | <a href="./README.zh-CN.md">简</a> | <a href="./README.zh-TW.md">繁</a> | <strong>KO</strong> | <a href="./README.ja.md">JA</a> | <a href="./README.pt-BR.md">PT</a>
</p>

<div align="center">
  <img src=".github/assets/app.png" alt="Token Monitor 커뮤니티 플러그인" width="120">
  <h1>Token Monitor 커뮤니티 플러그인</h1>
  <p><em>앱과 별도로 출시되는 선택형 확장 기능.</em></p>
</div>

## 소개

[Token Monitor](https://github.com/Javis603/token-monitor)용 커뮤니티 플러그인 모음입니다. 각 플러그인은 자체 버전, README, 호환성 요구 사항 및 라이선스 고지를 갖습니다.

| 플러그인 | 설명 | 버전 |
| --- | --- | --- |
| [Magpie Routes](plugins/magpie-routes/README.ko.md) | 로컬 실시간 라우팅과 컨텍스트 보기. | `0.1.0` |

## 설치

**설정 → 플러그인 → 파일에서 설치**에서 전체 플러그인 폴더 또는 `.tmplugin`을 가져온 후 내용을 확인하고 활성화하세요. 지원하는 앱 버전, 플랫폼 및 설정은 각 README를 확인하세요. 사용자는 Node.js를 별도로 설치할 필요가 없습니다.

## 개발

개발 도구에는 Node 22.15+가 필요하며 npm 런타임 의존성은 없습니다. 빌드는 Token Monitor 소스의 패키지 검증기를 사용합니다. `--local-only`는 게시 없이 테스트 패키지만 생성합니다.

```sh
npm ci --ignore-scripts
npm test
npm run check -- --host /path/to/token-monitor
npm run build -- --host /path/to/token-monitor --local-only
```

## 문서

- [유지 관리 및 배포](docs/releasing.md)
- [검증 범위](docs/verification.md)
- [변경 기록](plugins/magpie-routes/CHANGELOG.ko.md)

## 라이선스

원본 코드와 문서는 [MIT](LICENSE)로 제공됩니다. 타사 라이선스와 출처는 [NOTICE](NOTICE.md)에 있습니다.
