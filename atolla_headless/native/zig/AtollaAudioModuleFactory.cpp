#include "audio_player.h"
#include "valdi_core/cpp/JavaScript/ModuleFactoryRegistry.hpp"
#include "valdi_core/cpp/Utils/ValueFunctionWithCallable.hpp"

#include <string>

namespace atolla::headless {

// Must match the path atolla_headless/src/AudioNative.d.ts is imported by, or the declaration
// resolves to nothing at runtime.
constexpr const char* kModulePath = "atolla_headless/src/AudioNative";

// Large enough for any answer the engine gives; it truncates to whatever length it is handed, so
// this cannot drift out of step with the Zig side.
constexpr size_t kReadBufferBytes = 1024;

namespace {

Valdi::Value readInto(size_t (*read)(unsigned char*, size_t)) {
    unsigned char buffer[kReadBufferBytes];
    const size_t length = read(buffer, sizeof(buffer));

    return Valdi::Value(
        Valdi::StringBox::fromString(std::string(reinterpret_cast<const char*>(buffer), length)));
}

} // namespace

class AtollaAudioModule : public snap::valdi_core::ModuleFactory {
public:
    AtollaAudioModule() = default;
    ~AtollaAudioModule() override = default;

    Valdi::StringBox getModulePath() final {
        return Valdi::StringBox::fromCString(kModulePath);
    }

    Valdi::Value loadModule() final {
        return Valdi::Value()
            .setMapValue("atollaAudioStart",
                         Valdi::Value(Valdi::makeShared<Valdi::ValueFunctionWithCallable>(
                             [](const Valdi::ValueFunctionCallContext& callContext) -> Valdi::Value {
                                 const Valdi::StringBox device = callContext.getParameterAsString(0);
                                 if (!callContext.getExceptionTracker()) {
                                     return Valdi::Value::undefined();
                                 }

                                 const std::string copied(device.toStringView());

                                 return Valdi::Value(atolla_audio_start(copied.c_str()));
                             })))
            .setMapValue("atollaAudioConfigure",
                         Valdi::Value(Valdi::makeShared<Valdi::ValueFunctionWithCallable>(
                             [](const Valdi::ValueFunctionCallContext& callContext) -> Valdi::Value {
                                 const Valdi::StringBox source = callContext.getParameterAsString(0);
                                 const Valdi::StringBox trackId =
                                     callContext.getParameterAsString(1);
                                 if (!callContext.getExceptionTracker()) {
                                     return Valdi::Value::undefined();
                                 }

                                 const std::string copiedSource(source.toStringView());
                                 const std::string copiedTrackId(trackId.toStringView());

                                 return Valdi::Value(atolla_audio_configure(copiedSource.c_str(),
                                                                           copiedTrackId.c_str()));
                             })))
            .setMapValue("atollaAudioSetPlaying",
                         Valdi::Value(Valdi::makeShared<Valdi::ValueFunctionWithCallable>(
                             [](const Valdi::ValueFunctionCallContext& callContext) -> Valdi::Value {
                                 const bool playing = callContext.getParameterAsBool(0);
                                 if (!callContext.getExceptionTracker()) {
                                     return Valdi::Value::undefined();
                                 }

                                 atolla_audio_set_playing(playing);

                                 return Valdi::Value::undefined();
                             })))
            .setMapValue("atollaAudioSeekToMs",
                         Valdi::Value(Valdi::makeShared<Valdi::ValueFunctionWithCallable>(
                             [](const Valdi::ValueFunctionCallContext& callContext) -> Valdi::Value {
                                 const double positionMs = callContext.getParameterAsDouble(0);
                                 if (!callContext.getExceptionTracker()) {
                                     return Valdi::Value::undefined();
                                 }

                                 return Valdi::Value(
                                     atolla_audio_seek_to_ms(static_cast<int64_t>(positionMs)));
                             })))
            .setMapValue("atollaAudioPositionMs",
                         Valdi::Value(Valdi::makeShared<Valdi::ValueFunctionWithCallable>(
                             [](const Valdi::ValueFunctionCallContext&) -> Valdi::Value {
                                 return Valdi::Value(
                                     static_cast<double>(atolla_audio_position_ms()));
                             })))
            .setMapValue("atollaAudioClear",
                         Valdi::Value(Valdi::makeShared<Valdi::ValueFunctionWithCallable>(
                             [](const Valdi::ValueFunctionCallContext&) -> Valdi::Value {
                                 atolla_audio_clear();

                                 return Valdi::Value::undefined();
                             })))
            .setMapValue("atollaAudioCurrentTrackId",
                         Valdi::Value(Valdi::makeShared<Valdi::ValueFunctionWithCallable>(
                             [](const Valdi::ValueFunctionCallContext&) -> Valdi::Value {
                                 return readInto(atolla_audio_current_track_id);
                             })))
            .setMapValue("atollaAudioDevices",
                         Valdi::Value(Valdi::makeShared<Valdi::ValueFunctionWithCallable>(
                             [](const Valdi::ValueFunctionCallContext&) -> Valdi::Value {
                                 return readInto(atolla_audio_devices);
                             })))
            .setMapValue("atollaAudioConsumeEvent",
                         Valdi::Value(Valdi::makeShared<Valdi::ValueFunctionWithCallable>(
                             [](const Valdi::ValueFunctionCallContext&) -> Valdi::Value {
                                 return readInto(atolla_audio_consume_event);
                             })));
    }
};

static auto kRegisterModule = Valdi::RegisterModuleFactory::registerTyped<AtollaAudioModule>();

} // namespace atolla::headless
