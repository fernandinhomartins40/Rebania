# Lista de homologação de hardware

Nenhum equipamento foi homologado ainda (P-03). Um adapter pode existir em `packages/hardware`, mas a homologação só é registrada após **teste físico**.

| Campo | Exemplo |
|---|---|
| Fabricante / modelo | — |
| Tipo | bastão RFID LF 134,2 kHz · leitor NFC · balança |
| Protocolo | HID teclado · BLE GATT · USB serial · SPP (indisponível no iOS) |
| Firmware | — |
| Plataforma / versão | Android 14 · iOS 18 · Chrome 1xx (web HID) |
| Tags testadas | FDX-B, HDX, NTAG… |
| Pareamento / reconexão | — |
| Repetição / supressão | `ReadDeduper` (janela 5 s) |
| Alcance / bateria | — |
| Fallback | digitação manual sempre disponível |
| Resultado | aprovado / aprovado com limitações / reprovado |
| Data e responsável | — |

Situação atual dos adapters: **modo teclado (HID)** implementado e testado só por software (`KeyboardWedgeReader`, `parseRfidLine`, `parseScaleLine`). BLE e NFC nativos: pendentes (G4).
