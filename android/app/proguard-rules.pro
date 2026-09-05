# Keep WebRTC native symbols
-keep class org.webrtc.** { *; }
-keepclassmembers class org.webrtc.** { *; }

# Keep Supabase-generated serializers (kotlinx.serialization)
-keepattributes RuntimeVisibleAnnotations,AnnotationDefault
-keep,includedescriptorclasses class com.wsgpolar.disband.**$$serializer { *; }
-keepclassmembers class com.wsgpolar.disband.** {
    *** Companion;
}
-keepclasseswithmembers class com.wsgpolar.disband.** {
    kotlinx.serialization.KSerializer serializer(...);
}