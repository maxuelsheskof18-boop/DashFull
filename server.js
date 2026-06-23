const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// 👥 BANCO DE CONTAS - ADICIONE OS NOVOS COOKIES AQUI (CORRIGIDO)
const CONTAS = [
    {
        nome: "EHF Distribuidora",
        cookie: "_d2id=4e5e86be-9d00-481c-94be-9ce7821e930c; ftid=7mhq0HX3vkcnGD47VVsvtefrYLpjrZNN-1761563741452; cookiesPreferencesNotLogged=%7B%22categories%22%3A%7B%22advertising%22%3Atrue%2C%22functionality%22%3Anull%2C%22performance%22%3Anull%2C%22traceability%22%3Anull%7D%7D; _hjSessionUser_720738=eyJpZCI6ImY5MzYwN2Q0LThhNjctNWI1NC05YmZkLWMzNGZjOGJkN2JkOSIsImNyZWF0ZWQiOjE3NjE1NjM3NDQyMjQsImV4aXN0aW5nIjp0cnVlfQ==; _tt_enable_cookie=1; _ttp=01K8JYK6VAR38TC7JJH88YYHAY_.tt.2; _hjSessionUser_580848=eyJpZCI6IjRmOTdhNWQ0LTE0ODYtNWFhZC04NWQ1LWE5YThiNDU5NTEwOSIsImNyZWF0ZWQiOjE3NjE1NzI4OTYxMzYsImV4aXN0aW5nIjp0cnVlfQ==; _derived_epik=dj0yJnU9Tkk1bXhfVUN6R3U0SEFzUHNWUDM2SjVYb3o5RU43Y2Imbj1BR0hwSndIUFZQSW0zdzk5cC00b0l3Jm09NCZ0PUFBQUFBR2xmMlhzJnJtPTQmcnQ9QUFBQUFHbGYyWHMmc3A9Mg; _pin_unauth=dWlkPVpXSmxabVJpTmpFdE0yRXhPUzAwWWpVMkxXSTVZVGd0TnpFd1lXVXhOREk0T1RRMg; orgnickp=EHF%20DISTRIBUIDORA; orguserid=7009ZTdhTdtdT; ssid=ghy-010909-yEGJWBnTqu74aJ2Ar5uADwStWWiwHD-__-1120740604-__-1862658227259--RRR_0-RRR_0; orguseridp=1120740604; cookiesPreferencesLoggedFallback=%7B%22userId%22%3A1120740604%2C%22categories%22%3A%7B%22advertising%22%3Atrue%2C%22functionality%22%3Anull%2C%22performance%22%3Anull%2C%22traceability%22%3Anull%7D%7D; _ga=GA1.3.989798448.1768568361; cto_bundle=8J_jU19uYVFBNWlQUlpkeVd0TlZCU0txdjNhalJ3WHFBWHJxYXQ0ZW1CZHBUZGwwaVpoYkcxeW5vbXVvaTZXN050ZlhiSE1XcnJVTEM0SUE3eTZZdEdMdE5Ta21uaUQlMkZXTEhrMmpuQ3dqSXd0UUs4WE5IaWFlUnJpRFlBcjZzbDU5Y2ZF; c_Z1l9PLD=1; _uetvid=08e5e4b0b33b11f0a266cf3fcaccc2ac; ttcsid_C9SJ5SBC77UADFMAH8T0=1780659311003::XVCNwYfwYbQSQgdhVQa3.203.1780659328194.1; ttcsid_CFVSC2JC77U0ARCJTCJ0=1780659311008::1e9Gt4-WOh7UOEpV-axi.204.1780659328196.1; _gcl_au=1.1.1674280848.1778515147.1478041714.1780659329.1780659329; ttcsid=1780659311006::SFkjy3ybK_A1aaWoz0ae.204.1780659328196.0::1.17084.166::24157.1.1117.278::17123.1.109; c_Z22Y2rV=1; cp=03055000; c_Z1EacyQ=1; c_s7dla=1; ml_cart-quantity=1; _mldataSessionId=7a8f1509-38bc-4368-a91d-ebfc95da9516; rtid=91b52dff-fdda-4e0a-bc0b-10d404b7ba08; cookiesPreferencesLogged=%7B%22userId%22%3A1120740604%2C%22categories%22%3A%7B%22advertising%22%3Atrue%2C%22functionality%22%3Anull%2C%22performance%22%3Anull%2C%22traceability%22%3Anull%7D%7D; nsa_rotok=eyJhbGciOiJSUzI1NiIsImtpZCI6IjMiLCJ0eXAiOiJKV1QifQ.eyJpZGVudGlmaWVyIjoiZGMxZTRjMTgtNmRiOC00YTkxLWE1Y2UtZjM1MGVjYjE0MzdjIiwicm90YXRpb25faWQiOiIxZDdmOWUyNS0xOTVjLTQ2NDAtYWYzZC02MGM3YzMyNjM2MWMiLCJwbGF0Zm9ybSI6Ik1MIiwicm90YXRpb25fZGF0ZSI6MTc4MjIyNTQ0MCwiZXhwIjoxNzg0ODE2ODQwLCJqdGkiOiJiODE5NmRjYS03NzZjLTQ5NTMtYTRmMy02YjMxZDhhYWU0MTIiLCJpYXQiOjE3ODIyMjQ4NDAsInN1YiI6ImRjMWU0YzE4LTZkYjgtNGE5MS1hNWNlLWYzNTBlY2IxNDM3YyJ9.B37EKcnhPAnxRrmbsc5cr9NlHmg2mdrNbODNpoKwqlRje1VjH-_fFBx9wMKoQHW9-9VzobkdyJoXGHcmDtvlRMRN7D0yo_ebgWShizMawYvEB9Ugd7m4UjeNjXTIQJqqbIURBYGKpP3Phis6TDkU53w04eyai8_ZuV4gNtxOQocfEVn5Fx4q2372AhZQ3Uy7aH3CCqR20Em7AML-djKGvlf3w64p3sUq0FVuPs0u_cGcUDQ_VQHGqiWpkG70Gp0FEZwEEkjPFS-5c7mjkTz9Y3XTPK7rLx1QkwycMSj5Y6JYDuVPWD_hZLYz8JyD-3J0oQwyGbpz6WsU_35VyxlJjA; _hjSession_580848=eyJpZCI6IjgzMzRmM2JlLTYwNmQtNGViYi1iODJkLTYxOGZjYTkwNGVkZiIsImMiOjE3ODIyMjUwNTgwNzgsInMiOjEsInIiOjAsInNiIjowLCJzciI6MCwic2UiOjAsImZzIjowLCJzcCI6MH0=; _csrf=FTyvOSt7G7GVp_Cpmnw5VJ6p"
    },
    {
        nome: "EHF Comercio",
        cookie: "_d2id=dcc8f692-da78-45d0-82c6-e167d6ab952b; orguseridp=1134546632; orgnickp=SOMA7831422; ftid=EYa6q2vCGSqYrmaGVDaUetUXQa3tTBln-1773320065446; cookiesPreferencesLoggedFallback=%7B%22userId%22%3A1134546632%2C%22categories%22%3A%7B%22advertising%22%3Atrue%2C%22functionality%22%3Anull%2C%22performance%22%3Anull%2C%22traceability%22%3Anull%7D%7D; cookiesPreferencesNotLogged=%7B%22categories%22%3A%7B%22advertising%22%3Atrue%2C%22functionality%22%3Anull%2C%22performance%22%3Anull%2C%22traceability%22%3Anull%7D%7D; _hjSessionUser_580848=eyJpZCI6IjBkZmNlYmY4LTc5MjQtNTQ3Ni04NzUyLWMzNGNlYzFjN2UzNiIsImNyZWF0ZWQiOjE3NzMzMjA0ODc3NDMsImV4aXN0aW5nIjp0cnVlfQ==; _tt_enable_cookie=1; _ttp=01KKH2NT4NRJQ9K9CWCDY04GBF_.tt.2; _twpid=tw.1773403235608.179837417481541861; _fbp=fb.2.1773403236506.815080309174135931; _pin_unauth=dWlkPU1qY3hZMkZtTnpndFlUQTROaTAwTmpKbUxUZzRaakV0TlRVeU1EYzNZVGRsWW1KaA; _cq_duid=1.1773412400.4b9zzqOAXyvUput3; orguserid=H00TH0T9TttHZ; ssid=ghy-032010-WSN6r71oXspS6A0c43E9i5cMydeVU8-__-522101670-__-1868712856576--RRR_0-RRR_0; _ga=GA1.3.1554551682.1775048806; _hjSessionUser_720738=eyJpZCI6Ijg1YTg4YjJiLWRiZTEtNTNiNS1iODA2LTAxNzJlYWQzODdmNCIsImNyZWF0ZWQiOjE3NzYzNDA3MjkxMjcsImV4aXN0aW5nIjp0cnVlfQ==; __rtbh.uid=%7B%22eventType%22%3A%22uid%22%2C%22id%22%3A%221134546632%22%2C%22expiryDate%22%3A%222027-05-20T14%3A05%3A53.323Z%22%7D; __rtbh.lid=%7B%22eventType%22%3A%22lid%22%2C%22id%22%3A%22Qeyu6lMm2BAHbxt8hKnZ%22%2C%22expiryDate%22%3A%222027-05-20T14%3A05%3A53.329Z%22%7D; c_Z1l9PLD=1; c_Z22Y2rV=1; _gcl_au=1.1.1228720002.1781184238; c_Z1EacyQ=1; cto_bundle=mE8RnV9EQTVyWThVb2NLZjR5eVFQNnF5OVRmMU8xOEolMkJM\u002elements; _cq_session=49.1781605444906.5TrlncXKRtgtJVKg.1781605444904; c_s7dla=1; _gcl_aw=GCL.1781897023.CjwKCAjw0dPRBhAPEiwAE5vTTj6AIx3b6EF1xdDaQW6PEbQrJ6s3mEiJeMji0nooHNTr_6QV6yO9RRoCIE4QAvD_BwE; _gcl_gs=2.1.k1$i1781897020$u45528248; cp=07912110; _uetvid=bfac89201e1411f1b0cc87c6e4b7db1d; ttcsid_C9SJ5SBC77UADFMAH8T0=1782146630680::VJsrDR6eupfv1VU3s4Uy.74.1782146630737.1; ttcsid=1782146630683::OwzGvWTKbPss2BvbKhO1.79.1782146631674.0::1.-4590.0::0.0.0.0::0.0.0; ttcsid_CFVSC2JC77U0ARCJTCJ0=1782146630705::nw5tbGf61RW8tmHoPOSE.78.1782146631675.0; ml_cart-quantity=7; x-meli-session-id=armor.c7e09aad0ef61e87110652bdcc771f325d886df7ff95183629d5b42f5f9f94988b4fedc20fe0a491233d6644615ded84da1eb61750b1da69be39ec09904abec858068dbf54c2d3a1ea0c03d0ac41b977228fd3bd8b9ebf9c1979d87c23b5a390.b2f749043597412a36e2ecdfe4b9a2cb; _csrf=If_dlqu5v8ZbWV6ZqLAs4Xdv; _mldataSessionId=269ba880-23b7-4631-b159-8a67cddff276; cookiesPreferencesLogged=%7B%22userId%22%3A1134546632%2C%22categories%22%3A%7B%22advertising%22%3Atrue%2C%22functionality%22%3Anull%2C%22performance%22%3Anull%2C%22traceability%22%3Anull%7D%7D; nsa_rotok=eyJhbGciOiJSUzI1NiIsImtpZCI6IjMiLCJ0eXAiOiJKV1QifQ.eyJpZGVudGlmaWVyIjoiZDMfZTZmN2QtMTY1NS00YUe3LTkxMTUtMWY0YWE4MTFmZTQxIiwicm90YXRpb25faWQiOiJlNjk5NzA3Yy04NjYwLTQ3MTYtYjdjYi1mMTJiNjJhZTdiMzIiLCJwbGF0Zm9ybSI6Ik1MIiwicm90YXRpb25fZGF0ZSI6MTc4MjIzNTkzNCwiZXhwIjoxNzg0ODI3MzM0LCJqdGkiOiIyNGNhZDM1ZC0yMGFhLTQzYmEtYjk1OS04MDA0MjNhZjhjMjMiLCJpYXQiOjE3ODIyMzUzMzQsInN1YiI6ImQzZmU2ZjdkLTE2NTUtNDRlNy05MTE1LTFmNGFhODExZmU0MSJ9.NnJ3-BItsImMBP85AIFAq7_5S52b1n0a_HeYA_SotR5K_1DOI91vG77P9pmqfWFZryEtq9J6WPWkVRYacWa5yjJo6uWYXuM8ehCk_2yG-yk2e0kTb6M_mKMmCAeXiVfG3DspdnFJD-SYKQbJbv1FmyuyJuKKsPmdH956cMgiQWvaM1uKiByRhz1VbyLe7d5dFQ6zRJv2Ndp7YQuLoFgUQJnaCXfObQQNyjFk0Q9MVXdFY4NXaSS8I5IaRVE2zkQb_IziAStU12RezgYwMAGKHriNLmjbrS3yAAEWK1mofMScSAt43oCcbN4i1CmWWiahz180-xOgXRJeVwqqW8AX_Q; hide-cookie-banner=1134546632-COOKIE_PREFERENCES_ALREADY_SET"
    }, // 👈 Adicionada a vírgula aqui
    {
        nome: "EHF Suprimentos",
        cookie: "_d2id=d5d8932c-8e51-4698-b8ba-841adfb0b10d; orguserid=00THd0tHdtT0d; orguseridp=1406306410; ssid=ghy-102714-IZ5rvRT8cW90mgZnt5JdVXHn2Av4t3-__-760738523-__-1856284067780--RRR_0-RRR_0; ftid=CB9eQ2x5AbkyfRRYg1EdKzoYt2f9ODff-1761563506439; orgnickp=FAGECBFDH07661; cookiesPreferencesNotLogged=%7B%22categories%22%3A%7B%22advertising%22%3Atrue%2C%22functionality%22%3Atrue%2C%22performance%22%3Atrue%2C%22traceability%22%3Atrue%7D%7D; _hjSessionUser_720738=eyJpZCI6IjQzYWVmODg0LTM2ZjMtNWZjZC1hZmFhLTQxZDI5NWNkYWFjYiIsImNyZWF0ZWQiOjE3NjE1ODYzMDI0NTEsImV4aXN0aW5nIjp0cnVlfQ==; _tt_enable_cookie=1; _ttp=01K8KETTB0MBZFNZNYXPJDATVD_.tt.2; _hjSessionUser_580848=eyJpZCI6IjA1YTk5NDlmLTZhNWEtNWViMC05Y2M3LTE1ZGUzMWI0NDcyOSIsImNyZWF0ZWQiOjE3NjE2NDM5NzYzNTQsImV4aXN0aW5nIjp0cnVlfQ==; _fbp=fb.2.1763566963723.996246271294317513; _cq_duid=1.1764280579.VhsXwGc0xG9dyFj4; _pin_unauth=dWlkPVkySTFNak5tWkdVdFlqVXlNUzAwTW1Wa0xUazBaREF0WlRaaE5EYzBOREV4WlRSag; cookiesPreferencesLoggedFallback=%7B%22userId%22%3A1406306410%2C%22categories%22%3A%7B%22advertising%22%3Atrue%2C%22functionality%22%3Atrue%2C%22performance%22%3Atrue%2C%22traceability%22%3Atrue%7D%7D; _ga=GA1.3.783467196.1768570113; _twpid=tw.1772450081784.866431155590198934; __rtbh.uid=%7B%22eventType%22%3A%22uid%22%2C%22id%22%3A%221406306410%22%2C%22expiryDate%22%3A%222027-04-27T10%3A56%3A44.440Z%22%7D; __rtbh.lid=%7B%22eventType%22%3A%22lid%22%2C%22id%22%3A%22kDeU7yRLezEXaPPnVKSI%22%2C%22expiryDate%22%3A%222027-04-27T10%3A56%3A44.440Z%22%7D; c_Z1l9PLD=1; c_Z22Y2rV=1; _gcl_au=1.1.1386914091.1777287339.1652250399.1780659500.1780659500; c_Z1EacyQ=1; c_s7dla=1; _uetvid=ad73ce10b36211f0854515d197bb8f0f; cto_bundle=4lQUYF92MjFXa0ZlOGJaQ2RGemh2VFQ1ZGNCcHZuYmRBV2I0eW9YS1ZDenlFVGhvUjI0UWdKRVZxa2ZyMDBwcDVHdnBqSlJvV1J1WiUyRml1TE1XczVkU3dCU0ZBUmxjclJFVlg1bGV1aW5Fd1NBZ3M3Zm5HYnROcmxYVzBtaHNHTjJCUTFidFolMkIyWlo2dmExdlVVenhSUVZMNHdpZWo1MVdEZEs5N3p0ajFSYWJFNWl3JTNE; _cq_session=28.1781876887495.yaD3VhvkmE7nYtEO.1781876887494; _cq_s=hQcLK9INMbZRsTKo:D5sdsUl0+mWyKX+f0mQhoIJPMWCwquUnf0WHcbu0zFL4HdhlKQjZO6k8cYSvAYZMlPAKwZ34YgZV/X1BmjJ636FdQmDW709FY6W1CkeKyNFu2Iscze0EA5UfQOeweYH4x95v:DUXF4B9wxX+FH3/yyaJX7g==; ttcsid_C9SJ5SBC77UADFMAH8T0=1781876885821::m0P8rvyt73clldPje9yI.403.1781876896465.1; ttcsid=1782131438302::0HUHmQxvNr9M0NQ-YWu_.404.1782131448786.0::0.-3198.0::0.0.0.0::0.0.0; ttcsid_CFVSC2JC77U0ARCJTCJ0=1782131438300::46xCktQlB1NpkhNtFMvb.403.1782131448788.1; cp=22020001; x-meli-session-id=armor.2c15bee1b5c19c0ae18763a7adb7d8e2ec43b2af7a6554273cd50101703adc6947267933b22ca998d5187aa528fedbf99b7a8163a3f8d80e68a6d194bb29e8105bde5a8e80c5f83bf2627b8e4a93a608d1509ecd9d4790da4550adbab89539a4.9afffb542287e778c522777bf8b22edc; ml_cart-quantity=1; _mldataSessionId=c8aad16a-975f-4ec2-b69f-5c6c78189396; cookiesPreferencesLogged=%7B%22userId%22%3A1406306410%2C%22categories%22%3A%7B%22advertising%22%3Atrue%2C%22functionality%22%3Atrue%2C%22performance%22%3Atrue%2C%22traceability%22%3Atrue%7D%7D; hide-cookie-banner=1406306410-COOKIE_PREFERENCES_ALREADY_SET; nsa_rotok=eyJhbGciOiJSUzI1NiIsImtpZCI6IjMiLCJ0eXAiOiJKV1QifQ.eyJpZGVudGlmaWVyIjoiN2RmNzA3OTYtZTAxMS00MGQ5LTkyMzYtNzFhZTIwMmFkY2JkIiwicm90YXRpb25faWQiOiI2NGZlNTk4My1mNDIzLTQyODctOWUxOS1lNGQzOGMwMWQ2ZDYiLCJwbGF0Zm9ybSI6Ik1MIiwicm90YXRpb25fZGF0ZSI6MTc4MjIzNjI1MCwiZXhwIjoxNzg0ODI3NjUwLCJqdGkiOiIxZTc1MWMwNC04NjlkLTRlODAtYTRlYi02MWFiOTQ0YzM0MzgiLCJpYXQiOjE3ODIyMzU2NTAsInN1YiI6IjdkZjcwNzk2LWUwMTEtNDBkOS05MjM2LTcxYWUyMDJhZGNiZCJ9.F6b6QaitB6QhWtfxMpu59uUFBvt0GHEIisVaNTmUtS_5Ew-FBNeJkDZ1XjdCZfbU5xb7jEXmd62yc-rvO09TmoR38zm5IkB1t95WuT0AM_NLxm_rqqpNA6csdoFp1ep3Cj9o5Emj5wpuH1H0xQ-yCcjELK6EFTwhsC4loBQFx8w1yuH8jzkwQ0JEH96ZbBwsyN5Wnxmfx5zDppLiZAPxDniNzDknAXU55OYFath3MGrnTECXvuQRupDC4FGPkjGlPKQeuEsG3djPiyN3bH0Bq1Si0nA9byYGfhF16Y7TqJ4FsH5lz7L-RKr-YUMYAMkKD0Xp5sRHYziUf5rUtwoWww; _csrf=1EsN24Xm-lxfqIiZ3nQQAD8s"
    }, // 👈 Adicionada a vírgula aqui
    {
        nome: "EKN",
        cookie: "_d2id=f588b210-1693-4d50-8a76-2f93d318d5b0; orguseridp=658952763; ftid=PObf2UE3Nm3rDdg8eUJT04KIH5SU6qLo-1761572164611; orgnickp=KAMILAALVESDEOLIVEIRAKAMIL; cookiesPreferencesNotLogged=%7B%22categories%22%3A%7B%22advertising%22%3Atrue%2C%22functionality%22%3Anull%2C%22performance%22%3Anull%2C%22traceability%22%3Anull%7D%7D; _hjSessionUser_720738=eyJpZCI6IjI0Mzg1NjY1LTA3MjUtNWQ5My1hZjYzLTlmZThlMDdhYzJmNiIsImNyZWF0ZWQiOjE3NjE4Mzg4NjQwNTksImV4aXN0aW5nIjp0cnVlfQ==; _tt_enable_cookie=1; _ttp=01K8TWRP9444X24FK9NV6V4B97_.tt.2; _hjSessionUser_580848=eyJpZCI6IjViYTZhNjMwLTlmM2QtNTZlMi1iNDM5LWU1ZDQxMWE1Y2FmNiIsImNyZWF0ZWQiOjE3NjM1ODI5NjUwMTYsImV4aXN0aW5nIjp0cnVlfQ==; _fbp=fb.2.1765296818499.805272797983817171; _cq_duid=1.1765299191.9ESVTRcdsKfN8Pgl; cookiesPreferencesLoggedFallback=%7B%22userId%22%3A658952763%2C%22categories%22%3A%7B%22advertising%22%3Atrue%2C%22functionality%22%3Anull%2C%22performance%22%3Anull%2C%22traceability%22%3Anull%7D%7D; _pin_unauth=dWlkPU1EZGxPR1l3WlRRdE5HWTRNeTAwTXpZMExXRmhOR0l0TnpZNFlUZ3pZalJsWWprMw; __gads=ID=647517bcd722b996:T=1769082072:RT=1769082072:S=ALNI_MYJPFrOdw7Mm_PmimcRMo-m4VN3XA; __gpi=UID=0000132d4c8ee6e2:T=1769082072:RT=1769082072:S=ALNI_Ma08UpcDHI_sm8nru6r9sa_p2ckZA; __eoi=ID=0cbc8820a5eaad00:T=1769082072:RT=1769082072:S=AA-AfjYn09qfDk9KPD7znEDRj0AP; _ga=GA1.3.45381044.1773419028; _twpid=tw.1774978484489.945671727668252755; _gcl_au=1.1.39734844.1777570592; cto_bundle=atLgJl9WVW95RVVCJTJCeXVBek1wQnV2a0N1dndpMm1WNTRhVDN1V2dvWXJ3QUU5UUJ2Z1FiRG5tSkVSdjMlMkJWYkRQV0Y2cGZPTWJBZ09TNkUwUU52MEtmUmNWNTFqUnQlMkJVdkg0SlVmbGRkenM4MzFleUt1TnRKUVBQZE1oYk9vZGZXd0V4d1FiTTFEVTdHZzRINW1BUkQ1dDdCUzRMd01vVnhNR1NjUEt4enI4VGhSRUElM0Q; _cq_session=4.1779132768913.TAM5WxC7guNnGRNB.1779132793894; ttcsid_C9SJ5SBC77UADFMAH8T0=1779825187309::yhwfNbR1x_KsGoo_nc0z.173.1779825187325.0; _uetvid=91ed8420b5a711f08394cfe6ae66d451; ttcsid_CFVSC2JC77U0ARCJTCJ0=1779825187314::uper-Q-zvQXVfV8nEFfW.175.1779825190297.0; ttcsid=1779825187312::P5iCDD7OOkj7gvsHp_g-.176.1779825190297.0::1.-2380.50::2978.2.1401.1045::91905.8.625; c_2l78kU=1; cp=05181200; c_Z1EacyQ=1; c_s7dla=1; ml_cart-quantity=2; _csrf=Ox53FQo5PAtACuVl-7kM5NId; _mldataSessionId=9a9ebff5-b3f4-4162-8817-46b27411560c; _hjTLDTest=.mercadolivre.com.br; ssid=ghy-062315-boY5Mv50rUue1dj5gnqazJNag0GsAe-__-658952763-__-1876938885149--RRR_0-RRR_0; orguserid=9t997d49ZhtH; cookiesPreferencesLogged=%7B%22userId%22%3A658952763%2C%22categories%22%3A%7B%22advertising%22%3Atrue%2C%22functionality%22%3Anull%2C%22performance%22%3Anull%2C%22traceability%22%3Anull%7D%7D; hide-cookie-banner=658952763-COOKIE_PREFERENCES_ALREADY_SET; nsa_rotok=eyJhbGciOiJSUzI1NiIsImtpZCI6IjMiLCJ0eXAiOiJKV1QifQ.eyJpZGVudGlmaWVyIjoiZGE5OGU5OWEtYzM2ZS00ZDdhLWFjOWUtODUyZGMwYjAwOTFkIiwicm90YXRpb25faWQiOiJkY2UxOWJhYy01NDQzLTQxZTMtODBjMi1kZTQ2MmMzM2JmNzciLCJwbGF0Zm9ybSI6Ik1MIiwicm90YXRpb25fZGF0ZSI6MTc4MjI0NTA5MSwiZXhwIjoxNzg0ODM2NDkxLCJqdGkiOiI2MzJkYWRiOC0yOTZlLTRhYTYtYjgxZC1hN2RmYjJlNzQxMzYiLCJpYXQiOjE3ODIyNDQ0OTEsInN1YiI6ImRhOThlOTlhLWMzNmUtNGQ3YS1hYzllLTg1MmRjMGIwMDkxZCJ9.flMxGRws3ae8OFmgdb43QxI8MnX-_un9wC3PITX4dM3SYRWIelgAfOSYc_QIZ_ekZ6jEXjLDQjAtuchYBe-WOIXRFf8468GtAgeurKQ3KrVnkbzOiUox6_YMV-dgEWd-lBLPxI7DIOrrejtcHXYUGItZ4b8V2qun-n4K1KSHs3ACoJdaUTvb-ULsUvwq_XJWTSEJqGnTlus_oWThieB2NTdBnzQ1o34dm-ZnOts944qHytY5A3PYs9LZAC6rq6zGaeReS_OUWqsxL9T56jOls3aaWMD772lCw2OldHqZerK258bCHO1RxyDacPgWk6-090AEumhfOJzie5eDZkZnSw"
    }
];

// 🥷 MOTOR PRINCIPAL - EXTRAÇÃO E CAPTURA REAL
async function obterDadosDoFull() {
    let todosOsEnvios = [];

    // O loop percorre cada conta listada acima
    for (const conta of CONTAS) {
        try {
            // Pula a conta se o cookie ainda não foi preenchido
            if (conta.cookie.includes("COLE_AQUI")) continue;

            console.log(`📡 Conectando à API interna da conta: ${conta.nome}...`);

            const urlNavegador = `https://myaccount.mercadolivre.com.br/api/shipping/inbounds/search?limit=30&offset=0`;

            const resposta = await axios.get(urlNavegador, {
                maxRedirects: 0,
                validateStatus: (status) => status >= 200 && status < 303,
                headers: {
                    'accept': 'application/json, text/plain, */*',
                    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'cookie': conta.cookie, // Injeta o cookie específico desta conta
                    'x-requested-with': 'XMLHttpRequest'
                }
            });

            const bruto = resposta.data.results || resposta.data.data || [];
            
            // 🌟 MAPEAMENTO PERFEITO, CORRIGIDO E TRADUZIDO (SEU PADRÃO ORIGINAL)
            const enviosFormatados = bruto.map(envio => {
                const declaradas = envio.products_count || 0; 
                const recebidas = envio.on_sale_units || 0;   
                
                const dataReservada = envio.appointment && envio.appointment.date 
                    ? envio.appointment.date 
                    : (envio.date_created || new Date().toISOString());

                // 🏛️ DICIONÁRIO DE TRADUÇÃO DOS GALPÕES
                const mapaGalpoes = {
                    'BRSP06': 'Araçariguama',
                    'BRRC01': 'Perus'
                };

                const codigoOriginal = envio.logistic_center_id || '';
                const nomeAmigavel = mapaGalpoes[codigoOriginal] || codigoOriginal || '---';

                return {
                    conta: conta.nome, // 🎯 Define dinamicamente o nome baseado na conta ativa do loop
                    id_envio: envio.id || envio.inbound_id,
                    status: envio.status || 'unknown',
                    unidades_declaradas: declaradas,
                    unidades_recebidas: recebidas,
                    galpao: nomeAmigavel,
                    data: dataReservada
                };
            });

            // Une as remessas processadas no bolo geral
            todosOsEnvios = todosOsEnvios.concat(enviosFormatados);

        } catch (erro) {
            console.error(`❌ Erro na comunicação com a API interna da conta [${conta.nome}]:`, erro.message);
        }
    }

    // Devolve o bolo unificado ordenando por data para o painel não ficar bagunçado
    return todosOsEnvios.sort((a, b) => new Date(b.data) - new Date(a.data));
}

// 📡 ROTA OFICIAL DA API
app.get('/api/full/inbounds', async (req, res) => {
    console.log("📡 Dashboard solicitou atualização de dados...");
    const dados = await obterDadosDoFull();
    res.json(dados);
});

// Define a porta dinâmica da nuvem ou mantém a 3000 se rodar local
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`===================================================`);
    console.log(`🚀 APP INTEGRADO CONECTADO COM SUCESSO À PORTA ${PORT}!`);
    console.log(`===================================================`);
});
