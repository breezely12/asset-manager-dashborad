# 자산 관리 대시보드

주식 · 가상자산 · 현금/예금 · 부동산/기타 자산을 한 곳에서 조회하고,
간단한 가계부(수입/지출)를 관리하는 조회 전용 웹 대시보드입니다.
(실제 매수/매도는 하지 않습니다 — 입력한 데이터를 보여주고 계산만 합니다.)

## 실행 방법

```bash
pip install -r requirements.txt
```

```bash
python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

브라우저에서 http://localhost:8000 접속.

## 기능

- **자산 목록**: 주식/가상자산은 티커·심볼로 실시간 시세 조회(Yahoo Finance, CoinGecko),
  현금/부동산/기타는 수동으로 현재 가치를 입력·수정
- **전체 현황**: 총 자산, 총 손익, 자산 배분 도넛 차트, "오늘 스냅샷 저장"으로 쌓는 자산 변화 추이
- **순자산**: 최종 목표(기본 60세 100억) 대비 진행률과 중간 목표 눈금, 목표 달성에 필요한
  연평균 증가율·월평균 증가액, 스냅샷 기록 기준 실제 증가율과 예상 도달 연도, 목표·출생연도 설정
- **가계부**: 월별 수입/지출 입력, 카테고리별 지출 분석

## 데이터

`data/asset_manager.db` (SQLite)에 저장됩니다. 외부로 전송되지 않으며,
가격 조회만 Yahoo Finance / CoinGecko에 네트워크 요청을 보냅니다.

## 구조

```
backend/   FastAPI 서버 (holdings, transactions, snapshot, 가격 조회 API)
frontend/  정적 HTML/CSS/JS 대시보드 (프레임워크 없음)
data/      SQLite 데이터베이스
```
