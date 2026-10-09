import { CameraView, useCameraPermissions } from "expo-camera";
import { X } from "lucide-react-native";
import { useRef } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { color } from "../theme.ts";
import { Button, Muted } from "./ui.tsx";

/** Leitura de QR/código de barras pela câmera do aparelho (T09). */
export function Scanner({
  visible,
  onClose,
  onScan,
}: {
  visible: boolean;
  onClose: () => void;
  onScan: (value: string) => void;
}) {
  const [permission, request] = useCameraPermissions();
  const done = useRef(false);
  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      onShow={() => (done.current = false)}
    >
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        {permission?.granted ? (
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{
              barcodeTypes: ["qr", "code128", "ean13", "code39", "datamatrix"],
            }}
            onBarcodeScanned={(r) => {
              if (done.current || !r.data) return;
              done.current = true;
              onScan(r.data);
            }}
          />
        ) : (
          <View
            style={{
              flex: 1,
              justifyContent: "center",
              padding: 24,
              backgroundColor: color.canvas,
            }}
          >
            <Muted>O Rebania precisa da câmera para ler o código do brinco.</Muted>
            <View style={{ height: 16 }} />
            <Button label="Permitir câmera" onPress={() => void request()} />
          </View>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fechar câmera"
          onPress={onClose}
          style={{
            position: "absolute",
            top: 48,
            right: 20,
            backgroundColor: "rgba(0,0,0,0.5)",
            borderRadius: 24,
            padding: 10,
          }}
        >
          <X size={26} color="#fff" />
        </Pressable>
        <Text
          style={{
            position: "absolute",
            bottom: 48,
            alignSelf: "center",
            color: "#fff",
            fontSize: 16,
          }}
        >
          Aponte para o QR ou código do brinco
        </Text>
      </View>
    </Modal>
  );
}
