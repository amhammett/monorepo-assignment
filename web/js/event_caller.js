'use strict';

const main = () => {
  console.debug('loading app')
  
  class EventCaller extends React.Component {
    constructor(props) {
      super(props);
      this.state = { eventBody: '' };
    }

    componentDidMount() {
      this.GetEvent();
    }

    GetEvent() {
      fetch(this.props.endpoint)
      .then((response) => {
        return response.json();
      })
      .then((responseBody) => {
        this.setState({ eventBody: JSON.stringify(responseBody, null, JSON_STRINGIFY_INDENT)});
      })
      .catch((error) => {
        console.error(`error calling ${this.props.endpoint}`, error)
      })
    }

    render() {
      let eventBody = this.state.eventBody;
      return (
        <div id="event-body-text">
          <h2>Event Body Will Be Output Below</h2>
          <pre>
            { eventBody }
          </pre>
        </div>
      );
    }
  }

  const JSON_STRINGIFY_INDENT = 2;
  const e = React.createElement;

  const endpoint_url = document.getElementById('endpoint_url').innerHTML.trim();

  ReactDOM.render(
    <EventCaller endpoint={endpoint_url}/>,
    document.getElementById('root')
  );
};

main()