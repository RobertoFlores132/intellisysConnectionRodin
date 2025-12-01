import axios from "axios";
import qs from "qs";

export async function obtenerToken() {
  const url = "https://rodin.com.mx/b2b/api/auth_login.php";

  const data = qs.stringify({
    usuario: process.env.RODIN_USUARIO,
    password: process.env.RODIN_PASSWORD
  });

  try {
    const response = await axios.post(url, data, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      timeout: 15000
    });

    return response.data.token;
  } catch (error) {
    console.error("❌ Error al obtener token:", error.response?.data || error);
    return null;
  }
}