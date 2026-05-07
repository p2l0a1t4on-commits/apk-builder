from kivy.app import App
from kivy.uix.boxlayout import BoxLayout
from kivy.clock import Clock
from jnius import autoclass
from android.runnable import run_on_ui_thread

# Импорт необходимых Android классов
PythonActivity = autoclass('org.kivy.android.PythonActivity')
WebView = autoclass('android.webkit.WebView')
ViewGroup = autoclass('android.view.ViewGroup')
LayoutParams = autoclass('android.view.ViewGroup$LayoutParams')


class WebApp(App):
    def build(self):
        # Создаем основной layout
        layout = BoxLayout()
        return layout

    def on_start(self):
        # Запускаем создание WebView после инициализации UI
        Clock.schedule_once(self.create_webview, 0)

    @run_on_ui_thread
    def create_webview(self, dt):
        # Получаем активность
        activity = PythonActivity.mActivity

        # Создаем WebView
        webview = WebView(activity)

        # Включаем JavaScript
        websettings = webview.getSettings()
        websettings.setJavaScriptEnabled(True)

        # Загружаем сайт
        url = "https://kyril-messanger.netlify.app"  # Замените на ваш сайт
        webview.loadUrl(url)

        # Добавляем WebView в активность
        activity.setContentView(webview)


if name == 'main':
    WebApp().run()