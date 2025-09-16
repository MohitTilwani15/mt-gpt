import * as React from "react";
import Header from "./Header";
import HeroList, { HeroListItem } from "./HeroList";
import TextInsertion from "./TextInsertion";
import { makeStyles, TabList, Tab } from "@fluentui/react-components";
import type { TabListProps } from "@fluentui/react-components";
import { Ribbon24Regular, LockOpen24Regular, DesignIdeas24Regular } from "@fluentui/react-icons";
import { Chat } from "./Chat";
import { insertText } from "../taskpane";

interface AppProps {
  title: string;
}

const useStyles = makeStyles({
  root: {
    minHeight: "100vh",
  },
});

const App: React.FC<AppProps> = (props: AppProps) => {
  const [selectedTab, setSelectedTab] = React.useState("chat");
  const styles = useStyles();
  const listItems: HeroListItem[] = [
    {
      icon: <Ribbon24Regular />,
      primaryText: "Achieve more with Office integration",
    },
    {
      icon: <LockOpen24Regular />,
      primaryText: "Unlock features and functionality",
    },
    {
      icon: <DesignIdeas24Regular />,
      primaryText: "Create and visualize like a pro",
    },
  ];

  const handleTabSelect: TabListProps["onTabSelect"] = (_event, data) => {
    setSelectedTab(data.value as string);
  };

  return (
    <div className={styles.root}>
      <TabList selectedValue={selectedTab} onTabSelect={handleTabSelect}>
        <Tab value="chat">Chat</Tab>
        <Tab value="overview">Overview</Tab>
      </TabList>
      {
        selectedTab === "chat" &&
        <Chat />
      }
      {
        selectedTab === "overview" &&
        <>
          <Header logo="assets/logo-filled.png" title={props.title} message="Welcome" />
          <HeroList message="Discover what this add-in can do for you today!" items={listItems} />
          <TextInsertion insertText={insertText} />
        </>
      }
    </div>
  );
};

export default App;
