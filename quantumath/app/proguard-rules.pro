# kotlinx.serialization
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.**
-keepclassmembers class kotlinx.serialization.json.** { *** Companion; }
-keep,includedescriptorclasses class com.quantumath.app.**$$serializer { *; }
-keepclassmembers class com.quantumath.app.** { *** Companion; kotlinx.serialization.KSerializer serializer(...); }
