import "./globals.css";

export const metadata = {
  title: "เช็คชื่อแก๊ง",
  description: "สร้างแก๊ง ใส่รายชื่อสมาชิก แล้วเช็คชื่อจากภาพแคปด้วย OCR ในเบราว์เซอร์"
};

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
