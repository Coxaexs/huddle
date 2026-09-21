#include <QApplication>
#include <QCommandLineParser>
#include <QIcon>
#include "ui/mainwindow.h"

int main(int argc, char* argv[]) {
    QApplication app(argc, argv);
    app.setApplicationName("HuddleNative");
    app.setApplicationDisplayName("Huddle");
    app.setOrganizationName("DeepPixel");
    app.setApplicationVersion("1.0.0");

    // Command-line options
    QCommandLineParser parser;
    parser.setApplicationDescription("Huddle Native C++ / Qt 6 Client");
    parser.addHelpOption();
    parser.addVersionOption();

    QCommandLineOption serverOption(QStringList() << "s" << "server", "Huddle server URL", "url", "https://deeppixel.online");
    QCommandLineOption tokenOption(QStringList() << "t" << "token", "User authentication token", "token");
    parser.addOption(serverOption);
    parser.addOption(tokenOption);
    parser.process(app);

    MainWindow window;
    window.show();

    return app.exec();
}
