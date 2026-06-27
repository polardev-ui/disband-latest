import SwiftUI

struct MainTabView: View {
    var body: some View {
        TabView {
            ServersTab()
                .tabItem { Label("Servers", systemImage: "server.rack") }
            DirectMessagesTab()
                .tabItem { Label("Messages", systemImage: "bubble.left.and.bubble.right.fill") }
            FriendsTab()
                .tabItem { Label("Friends", systemImage: "person.2.fill") }
            ProfileTab()
                .tabItem { Label("You", systemImage: "person.crop.circle.fill") }
        }
        .tint(Brand.accent)
    }
}
