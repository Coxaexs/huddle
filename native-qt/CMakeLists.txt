cmake_minimum_required(VERSION 3.25)
project(hoffle-native VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)
set(CMAKE_AUTOUIC ON)

# Find Qt 6 packages
find_package(Qt6 REQUIRED COMPONENTS Core Gui Widgets Network)
find_package(Qt6 OPTIONAL_COMPONENTS WebSockets Multimedia)

# Optional LiveKit C++ SDK integration flag
option(ENABLE_LIVEKIT "Enable native LiveKit C++ SDK for WebRTC audio" OFF)

set(SOURCES
    src/main.cpp
    src/ui/mainwindow.cpp
    src/voice/voice_engine.cpp
    src/network/api_client.cpp
)

set(HEADERS
    src/ui/mainwindow.h
    src/voice/voice_engine.h
    src/network/api_client.h
)

add_executable(hoffle-native ${SOURCES} ${HEADERS})

target_include_directories(hoffle-native PRIVATE src)

target_link_libraries(hoffle-native PRIVATE
    Qt6::Core
    Qt6::Gui
    Qt6::Widgets
    Qt6::Network
)

if(TARGET Qt6::WebSockets)
    target_link_libraries(hoffle-native PRIVATE Qt6::WebSockets)
    target_compile_definitions(hoffle-native PRIVATE HAVE_QT_WEBSOCKETS)
endif()

if(TARGET Qt6::Multimedia)
    target_link_libraries(hoffle-native PRIVATE Qt6::Multimedia)
    target_compile_definitions(hoffle-native PRIVATE HAVE_QT_MULTIMEDIA)
endif()

if(ENABLE_LIVEKIT)
    find_package(LiveKit REQUIRED)
    target_link_libraries(hoffle-native PRIVATE LiveKit::livekit)
    target_compile_definitions(hoffle-native PRIVATE HAVE_LIVEKIT_SDK)
endif()

# Installation target
install(TARGETS hoffle-native RUNTIME DESTINATION bin)
