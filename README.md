# Blackhawk Up: Leave No Service Behind

## Usage

Neon-like representation of NerdGraph AlertableEntity data. Open alert violations are compounded into groups. Violations in the same group will be OR-ed. The rows are configurable. See Nerd Life [post](https://nerdlife.datanerd.us/new-relic/blackhawk-up-leave-no-service-behind-7a665535-1e62-4e98-8c44-7b89cb02f0f6)

## Getting started

First, ensure that you have [Git](https://git-scm.com/book/en/v2/Getting-Started-Installing-Git) and [NPM](https://www.npmjs.com/get-npm) installed. If you're unsure whether you have one or both of them installed, run the following command(s) (If you have them installed these commands will return a version number, if not, the commands won't be recognized):

```bash
git --version
npm -v
```

Next, install the [NR1 CLI](https://one.newrelic.com/launcher/developer-center.launcher) by going to [this link](https://one.newrelic.com/launcher/developer-center.launcher) and following the instructions (5 minutes or less) to install and setup your New Relic development environment.

Next, to clone this repository and run the code locally against your New Relic data, execute the following commands:

```bash
nr1 nerdpack:clone -r https://source.datanerd.us/prodjito/blackhawk-up.git
cd blackhawk-up
nr1 nerdpack:serve
```

Visit [https://one.newrelic.com/?nerdpacks=local](https://one.newrelic.com/?nerdpacks=local), navigate to the Nerdpack, and :sparkles:

## Configuring this Nerdpack

Modify `config.json`:
* *accountId*: The New Relic account containing the workloads to be rolled up.
* *intervalDelayMs*: Refresh interval in milliseconds.

## Deploying this Nerdpack

Open a command prompt in the nerdpack's directory and run the following commands.

```bash
# If you need to create a new uuid for the account to which you're deploying this Nerdpack, use the following
# nr1 nerdpack:uuid -g [--profile=your_profile_name]
# to see a list of APIkeys / profiles available in your development environment, run nr1 credentials:list
nr1 nerdpack:publish [--profile=your_profile_name]
nr1 nerdpack:deploy [-c [DEV|BETA|STABLE]] [--profile=your_profile_name]
nr1 nerdpack:subscribe [-c [DEV|BETA|STABLE]] [--profile=your_profile_name]

Visit https://one.newrelic.com/?nerdpacks=local and :sparkles:
